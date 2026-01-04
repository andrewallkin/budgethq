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


def update_password_for_local_dev(db_config):
    """Update password for local development user from environment variables."""
    import bcrypt
    
    username = os.environ.get("LOCAL_USERNAME")
    new_password = os.environ.get("LOCAL_PASSWORD")
    
    # Skip if environment variables are not set
    if not username or not new_password:
        return
    
    try:
        # Hash the new password using bcrypt
        hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Use psql with -c flag and proper escaping
        # Escape single quotes by doubling them for SQL
        escaped_password = hashed_password.replace("'", "''")
        escaped_username = username.replace("'", "''")
        
        # Update the password in the database using psql
        update_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", db_config["database"],
            "-t", "-c", f"UPDATE users SET hashed_password = '{escaped_password}' WHERE username = '{escaped_username}';"
        ]
        
        result = subprocess.run(update_cmd, check=True, capture_output=True, text=True)

        # Check if user was found and updated
        output = result.stdout.strip() + result.stderr.strip()
        if "UPDATE 1" in output or output == "1":
            logger.info(f"Successfully updated password for {username} for local development")
        elif "UPDATE 0" in output or output == "0":
            logger.warning(f"User {username} not found - password not updated")
        else:
            # If we can't determine, try a SELECT to verify
            verify_cmd = [
                "psql",
                "-h", db_config["host"],
                "-p", db_config["port"],
                "-U", db_config["user"],
                "-d", db_config["database"],
                "-t", "-c", f"SELECT COUNT(*) FROM users WHERE username = '{escaped_username}';"
            ]
            verify_result = subprocess.run(verify_cmd, check=True, capture_output=True, text=True)
            if verify_result.stdout.strip() == "1":
                logger.info(f"Password update completed for {username} (verification: user exists)")
            else:
                logger.warning(f"Could not verify password update for {username}")
            # If we can't determine, try a SELECT to verify
            verify_cmd = [
                "psql",
                "-h", db_config["host"],
                "-p", db_config["port"],
                "-U", db_config["user"],
                "-d", db_config["database"],
                "-t", "-c", f"SELECT COUNT(*) FROM users WHERE username = '{escaped_username}';"
            ]
            verify_result = subprocess.run(verify_cmd, check=True, capture_output=True, text=True)
            if verify_result.stdout.strip() == "1":
                logger.info(f"Password update completed for {username} (verification: user exists)")
            else:
                logger.warning(f"Could not verify password update for {username}")
            
    except Exception as e:
        logger.warning(f"Could not update password for local development: {e}")


def filter_sql_by_username(sql_lines, target_username, data_statement_types=None):
    """Always restore full backup, then clean up unwanted user data afterwards."""
    # Restore the full backup - cleanup happens afterwards
    return sql_lines


def cleanup_non_target_user_data(db_config, target_username):
    """Find target user and delete all data for other users."""
    logger.info(f"Finding user '{target_username}' and removing other user data")

    try:
        # Set PGPASSWORD for psql commands
        os.environ["PGPASSWORD"] = db_config["password"]

        # First, find the target user's ID
        find_user_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", db_config["database"],
            "-t", "-c", f"SELECT id FROM users WHERE username = '{target_username}' LIMIT 1;"
        ]

        result = subprocess.run(find_user_cmd, capture_output=True, text=True)
        target_user_id = result.stdout.strip()

        if not target_user_id:
            logger.error(f"Could not find user ID for '{target_username}' in restored database")
            return False

        target_user_id = int(target_user_id)
        logger.info(f"Found target user ID: {target_user_id} for '{target_username}'")

        # Check total users before cleanup
        count_users_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", db_config["database"],
            "-t", "-c", "SELECT COUNT(*) FROM users;"
        ]
        count_result = subprocess.run(count_users_cmd, capture_output=True, text=True)
        total_users_before = int(count_result.stdout.strip()) if count_result.stdout.strip().isdigit() else 0
        logger.info(f"Total users in database before cleanup: {total_users_before}")

        # Dynamically discover all tables with user_id columns (except users table)
        discover_tables_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", db_config["database"],
            "-t", "-c", """
                SELECT DISTINCT t.table_name
                FROM information_schema.columns c
                JOIN information_schema.tables t ON c.table_name = t.table_name
                WHERE c.column_name = 'user_id'
                  AND t.table_schema = 'public'
                  AND t.table_type = 'BASE TABLE'
                  AND t.table_name != 'users'
                ORDER BY t.table_name;
            """
        ]

        result = subprocess.run(discover_tables_cmd, capture_output=True, text=True)
        user_related_tables = [line.strip() for line in result.stdout.strip().split('\n') if line.strip()]


        # Use reverse alphabetical order for cleanup
        cleanup_tables = sorted(user_related_tables, reverse=True)
        deleted_counts = {}

        # Delete from each table where user_id != target_user_id
        for table in cleanup_tables:
            delete_cmd = [
                "psql",
                "-h", db_config["host"],
                "-p", db_config["port"],
                "-U", db_config["user"],
                "-d", db_config["database"],
                "-t", "-c", f"DELETE FROM {table} WHERE user_id != {target_user_id};"
            ]

            result = subprocess.run(delete_cmd, capture_output=True, text=True)
            affected_rows = result.stdout.strip()

            # Parse psql output - it returns "DELETE X" format
            if result.returncode == 0 and affected_rows.startswith('DELETE '):
                count_str = affected_rows.split(' ')[1]
                if count_str.isdigit():
                    deleted_counts[table] = int(count_str)
                else:
                    logger.warning(f"Unexpected DELETE output from {table}: '{affected_rows}'")
                    deleted_counts[table] = 0
            else:
                logger.error(f"DELETE from {table} failed - return code: {result.returncode}, output: '{affected_rows}', stderr: '{result.stderr.strip()}'")
                deleted_counts[table] = 0

        # Finally, delete all other users from the users table
        delete_users_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", db_config["database"],
            "-t", "-c", f"DELETE FROM users WHERE id != {target_user_id};"
        ]

        result = subprocess.run(delete_users_cmd, capture_output=True, text=True)
        output = result.stdout.strip()

        # Parse psql output - it returns "DELETE X" format
        if result.returncode == 0 and output.startswith('DELETE '):
            count_str = output.split(' ')[1]
            if count_str.isdigit():
                deleted_users = int(count_str)
            else:
                logger.warning(f"Unexpected DELETE output from users: '{output}'")
                deleted_users = 0
        else:
            logger.error(f"DELETE from users failed - return code: {result.returncode}, output: '{output}', stderr: '{result.stderr.strip()}'")
            deleted_users = 0

        # Log cleanup results
        logger.info(f"✅ Cleanup completed - only '{target_username}' data remains")
        logger.info(f"   - Removed {deleted_users} other users and {sum(deleted_counts.values())} related records")

        # Verify only target user remains
        verify_cmd = [
            "psql",
            "-h", db_config["host"],
            "-p", db_config["port"],
            "-U", db_config["user"],
            "-d", db_config["database"],
            "-t", "-c", "SELECT COUNT(*) FROM users;"
        ]

        result = subprocess.run(verify_cmd, capture_output=True, text=True)
        remaining_users = int(result.stdout.strip()) if result.stdout.strip().isdigit() else 0

        if remaining_users == 1:
            logger.info(f"✅ Verification successful: Only 1 user remains in database")
            return True
        else:
            logger.error(f"❌ Verification failed: {remaining_users} users remain (expected 1)")
            return False

    except Exception as e:
        logger.error(f"Error during dynamic cleanup: {e}")
        return False
    finally:
        # Clean up password environment variable
        if "PGPASSWORD" in os.environ:
            del os.environ["PGPASSWORD"]


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

        # Use Python to filter out problematic SET commands and filter by username, then pipe to psql
        import gzip
        import re

        # Get target username for filtering (defaults to andrewallkin@gmail.com)
        target_username = os.environ.get("RESTORE_TARGET_USERNAME", "andrewallkin@gmail.com")

        # Read and filter the backup file
        filtered_sql = []
        create_table_count = 0
        insert_count = 0
        data_statement_types = set()  # Track what types of data statements we find

        try:
            with gzip.open(temp_backup_file, 'rt', encoding='utf-8') as f:
                sql_lines = []
                for line in f:
                    # Filter out problematic SET commands
                    if re.match(r'^\s*SET\s+transaction_timeout', line, re.IGNORECASE):
                        continue
                    sql_lines.append(line)

            # Count important SQL statements (outside the file reading loop)
            for line in sql_lines:
                line_upper = line.upper().strip()
                if line_upper.startswith('CREATE TABLE'):
                    create_table_count += 1
                elif line_upper.startswith('INSERT INTO'):
                    insert_count += 1
                    data_statement_types.add('INSERT')
                elif line_upper.startswith('COPY '):
                    insert_count += 1  # Count COPY as data too
                    data_statement_types.add('COPY')

            # Filter SQL by username if specified
            filtered_sql = filter_sql_by_username(sql_lines, target_username, data_statement_types)

        except Exception as e:
            logger.error(f"Error reading/filtering backup file: {e}")
            return False

        if not filtered_sql:
            logger.error("Backup file appears to be empty after filtering")
            return False

        logger.info(f"Processing backup: {len(filtered_sql)} lines, {create_table_count} tables, {insert_count} data statements")
        if data_statement_types:
            logger.info(f"Data statement types found: {', '.join(data_statement_types)}")
        else:
            logger.warning("No data statements (INSERT/COPY) found in backup - appears to be schema-only")
        
        if create_table_count == 0 and insert_count == 0:
            logger.warning("Backup file contains no CREATE TABLE or INSERT statements - database may be empty")

        # Restore using psql
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

        # Send SQL to psql
        sql_content = ''.join(filtered_sql)
        try:
            stdout, stderr = psql_process.communicate(input=sql_content, timeout=300)
        except subprocess.TimeoutExpired:
            logger.error("Database restore timed out after 5 minutes")
            psql_process.kill()
            return False

        if psql_process.returncode != 0:
            logger.error(f"Database restore failed with return code {psql_process.returncode}")
            if stderr:
                # Only log stderr if it contains actual errors
                stderr_lower = stderr.lower()
                if any(keyword in stderr_lower for keyword in ['error', 'fatal', 'failed']):
                    logger.error(f"Restore error: {stderr}")
            return False

        logger.info("Database restore completed successfully")
        
        # Update password for local development user
        update_password_for_local_dev(db_config)
        
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

    # Target username for cleanup (defaults to andrewallkin@gmail.com)
    target_username = os.environ.get("RESTORE_TARGET_USERNAME", "andrewallkin@gmail.com")

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

        # Download and restore full backup
        success = download_and_restore_backup(backup_filename, gcs_client, db_config)
        if success:
            # Get target username for cleanup
            target_username = os.environ.get("RESTORE_TARGET_USERNAME", "andrewallkin@gmail.com")

            # Clean up data for other users
            cleanup_success = cleanup_non_target_user_data(db_config, target_username)

            if cleanup_success:
                logger.info("=" * 60)
                logger.info("Database initialization and cleanup completed successfully!")
                logger.info(f"Database now contains only data for user: {target_username}")
                logger.info("=" * 60)
            else:
                logger.error("Database restore succeeded but cleanup failed")
                logger.error("Database may contain data for multiple users")
                sys.exit(1)
        else:
            logger.error("Database initialization failed")
            sys.exit(1)

    except Exception as e:
        logger.error(f"Critical error during initialization: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

