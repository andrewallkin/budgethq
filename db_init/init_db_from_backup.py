#!/usr/bin/env python3
"""
Database initialization script for local development.
Downloads the latest backup from GCS and restores it to PostgreSQL.
"""

import os
import subprocess
import logging
import sys
import time
from gcs_client import GoogleCloudStorageClient

# Add parent directory to path to import logging_config from backup folder
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backup'))
from logging_config import configure_logging

# Configure logging
configure_logging()
logger = logging.getLogger(__name__)


def wait_for_postgres(db_config, max_attempts=30):
    """Wait for PostgreSQL to be ready."""
    logger.info("Waiting for PostgreSQL to be ready...")
    os.environ["PGPASSWORD"] = db_config["password"]

    for attempt in range(max_attempts):
        try:
            # Try to connect to the postgres database (default database)
            result = subprocess.run(
                [
                    "psql",
                    "-h", db_config["host"],
                    "-p", db_config["port"],
                    "-U", db_config["user"],
                    "-d", "postgres",
                    "-c", "SELECT 1;"
                ],
                capture_output=True,
                timeout=5
            )
            if result.returncode == 0:
                logger.info("PostgreSQL is ready!")
                return True
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            pass

        attempt += 1
        if attempt < max_attempts:
            logger.info(f"Attempt {attempt}/{max_attempts}: PostgreSQL not ready yet, waiting...")
            time.sleep(2)

    logger.error(f"PostgreSQL failed to become ready after {max_attempts} attempts")
    return False


def download_and_restore_backup(backup_filename, gcs_client, db_config):
    """Download the backup from GCS and restore it to PostgreSQL."""
    if not gcs_client.is_available():
        logger.error("GCS client not available")
        return False

    temp_backup_file = f"/tmp/{backup_filename}"

    try:
        # Download the backup file
        logger.info(f"Downloading backup: {backup_filename}")
        if not gcs_client.download_file(backup_filename, temp_backup_file):
            logger.error("Failed to download backup file")
            return False

        # Verify the backup file exists and is not empty
        if not os.path.exists(temp_backup_file):
            logger.error(f"Backup file not found at {temp_backup_file}")
            return False
        
        file_size = os.path.getsize(temp_backup_file)
        if file_size == 0:
            logger.error("Downloaded backup file is empty")
            return False
        
        logger.info(f"Backup file downloaded: {file_size} bytes")

        # Set PGPASSWORD for psql commands
        os.environ["PGPASSWORD"] = db_config["password"]

        # Terminate active connections to the database
        logger.info("Terminating active connections to database...")
        terminate_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", "postgres",  # Connect to default postgres database
            "-c", f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{db_config['database']}' AND pid <> pg_backend_pid();"
        ]

        try:
            subprocess.run(terminate_cmd, check=False, capture_output=True)
        except subprocess.SubprocessError as e:
            logger.warning(f"Could not terminate active connections: {e}")

        # Drop the database if it exists
        logger.info(f"Dropping existing database: {db_config['database']}")
        drop_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", "postgres",
            "-c", f"DROP DATABASE IF EXISTS {db_config['database']};"
        ]

        subprocess.run(drop_cmd, check=True, capture_output=True)

        # Create fresh database
        logger.info(f"Creating fresh database: {db_config['database']}")
        create_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", "postgres",
            "-c", f"CREATE DATABASE {db_config['database']};"
        ]

        subprocess.run(create_cmd, check=True, capture_output=True)
        logger.info("Database prepared for restore")

        # Restore from the compressed backup
        logger.info("Restoring database from backup...")

        # First, let's check if the backup is suspiciously small (might be empty)
        if file_size < 1000:  # Less than 1KB is suspicious
            logger.warning(f"Backup file is very small ({file_size} bytes) - may be empty or incomplete")

        # Use Python to filter out problematic SET commands, then pipe to psql
        import gzip
        import re
        
        # Read and filter the backup file
        filtered_sql = []
        all_lines = []
        create_table_count = 0
        insert_count = 0
        
        try:
            with gzip.open(temp_backup_file, 'rt', encoding='utf-8') as f:
                for line in f:
                    all_lines.append(line)
                    # Filter out problematic SET commands
                    # Skip SET commands for transaction_timeout and other unsupported parameters
                    if re.match(r'^\s*SET\s+transaction_timeout', line, re.IGNORECASE):
                        logger.debug(f"Filtering out unsupported SET command: {line.strip()}")
                        continue
                    # Keep all other lines
                    filtered_sql.append(line)
                    
                    # Count important SQL statements
                    line_upper = line.upper().strip()
                    if line_upper.startswith('CREATE TABLE'):
                        create_table_count += 1
                    elif line_upper.startswith('INSERT INTO'):
                        insert_count += 1
        except Exception as e:
            logger.error(f"Error reading/filtering backup file: {e}")
            return False

        if not filtered_sql:
            logger.error("Backup file appears to be empty after filtering")
            return False

        logger.info(f"Filtered backup contains {len(filtered_sql)} lines")
        logger.info(f"Backup analysis: {create_table_count} CREATE TABLE statements, {insert_count} INSERT statements")
        
        # Log first few lines for debugging
        if len(all_lines) <= 50:
            logger.info("Backup file contents (first 20 lines):")
            for i, line in enumerate(all_lines[:20], 1):
                logger.info(f"  {i}: {line.rstrip()}")
        else:
            logger.info("Backup file contents (first 10 and last 10 lines):")
            for i, line in enumerate(all_lines[:10], 1):
                logger.info(f"  {i}: {line.rstrip()}")
            logger.info("  ...")
            for i, line in enumerate(all_lines[-10:], len(all_lines) - 9):
                logger.info(f"  {i}: {line.rstrip()}")
        
        if create_table_count == 0 and insert_count == 0:
            logger.warning("Backup file contains no CREATE TABLE or INSERT statements - database may be empty")

        # Restore using psql with filtered SQL
        psql_process = subprocess.Popen(
            [
                "psql",
                "-h", db_config["host"],
                "-p", db_config["port"],
                "-U", db_config["user"],
                "-d", db_config["database"],
                "-v", "ON_ERROR_STOP=0",  # Don't stop on SET command errors
                "-1"  # Run in a single transaction
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Write filtered SQL to psql stdin
        sql_content = ''.join(filtered_sql)
        stdout, stderr = psql_process.communicate(input=sql_content)

        if psql_process.returncode != 0:
            logger.error(f"Database restore failed with return code {psql_process.returncode}")
            if stdout:
                logger.error(f"psql stdout: {stdout}")
            if stderr:
                logger.error(f"psql stderr: {stderr}")
            return False
        
        # Log success output if any (psql writes notices to stderr even on success)
        if stdout:
            logger.debug(f"psql output: {stdout}")
        if stderr:
            # Check if stderr contains actual errors or just notices
            stderr_lower = stderr.lower()
            if any(keyword in stderr_lower for keyword in ['error', 'fatal', 'failed']):
                logger.warning(f"psql stderr (may contain errors): {stderr}")
            else:
                logger.debug(f"psql notices: {stderr}")

        logger.info("Database restore completed successfully")
        
        # Verify tables were created by checking table count
        verify_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", db_config["database"],
            "-t", "-c", "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
        ]
        try:
            result = subprocess.run(verify_cmd, check=True, capture_output=True, text=True)
            table_count = result.stdout.strip()
            logger.info(f"Verification: Found {table_count} tables in public schema")
            if table_count == "0" or not table_count:
                logger.warning("No tables found after restore - restore may have failed silently")
        except Exception as e:
            logger.warning(f"Could not verify table count: {e}")
        
        return True

    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed during restore: {e}")
        if hasattr(e, 'stderr') and e.stderr:
            logger.error(f"stderr: {e.stderr.decode()}")
        return False
    except Exception as e:
        logger.error(f"Error during backup download/restore: {e}", exc_info=True)
        return False
    finally:
        # Clean up
        if "PGPASSWORD" in os.environ:
            del os.environ["PGPASSWORD"]
        if os.path.exists(temp_backup_file):
            try:
                os.remove(temp_backup_file)
                logger.info("Cleaned up temporary backup file")
            except Exception as e:
                logger.warning(f"Failed to clean up temp file: {e}")


def main():
    """Main initialization function."""
    logger.info("=" * 60)
    logger.info("Database Initialization from GCS Backup")
    logger.info("=" * 60)

    # Database configuration
    db_config = {
        "host": os.environ.get("POSTGRES_HOST", "postgres"),
        "port": os.environ.get("POSTGRES_PORT", "5432"),
        "user": os.environ.get("POSTGRES_USER"),
        "password": os.environ.get("POSTGRES_PASSWORD"),
        "database": os.environ.get("POSTGRES_DB")
    }

    # Validate required environment variables
    if not all([db_config["user"], db_config["password"], db_config["database"]]):
        logger.error("Missing required database environment variables")
        logger.error(f"POSTGRES_USER: {db_config['user']}, POSTGRES_PASSWORD: {'*' * len(db_config['password']) if db_config['password'] else None}, POSTGRES_DB: {db_config['database']}")
        sys.exit(1)

    logger.info(f"Target database: {db_config['database']} @ {db_config['host']}:{db_config['port']}")

    try:
        # Wait for PostgreSQL to be ready
        if not wait_for_postgres(db_config):
            logger.error("PostgreSQL is not ready")
            sys.exit(1)

        # Initialize GCS client
        gcs_client = GoogleCloudStorageClient()
        if not gcs_client.is_available():
            logger.error("GCS client initialization failed")
            sys.exit(1)

        # Get latest backup filename
        backup_filename = gcs_client.get_latest_backup_filename()
        if not backup_filename:
            logger.error("Could not find latest backup")
            sys.exit(1)

        # Download and restore
        success = download_and_restore_backup(backup_filename, gcs_client, db_config)
        if success:
            logger.info("=" * 60)
            logger.info("Database initialization completed successfully!")
            logger.info("=" * 60)
        else:
            logger.error("Database initialization failed")
            sys.exit(1)

    except Exception as e:
        logger.error(f"Critical error during initialization: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

