import json
import hashlib
import time
from pathlib import Path

# Create data directories
DATA_DIR = Path("data")
USERS_DIR = DATA_DIR / "users"
USERS_FILE = USERS_DIR / "users.json"

# ------------------------
# Authentication Functions (COMMENTED OUT FOR NOW)
# ------------------------
# def hash_password(password):
#     """Hash a password using SHA-256"""
#     return hashlib.sha256(password.encode()).hexdigest()

# def load_users():
#     """Load users from file"""
#     if USERS_FILE.exists():
#         try:
#             with open(USERS_FILE, "r") as f:
#                 return json.load(f)
#         except json.JSONDecodeError:
#             return {}
#     return {}

# def save_users(users):
#     """Save users to file"""
#     with open(USERS_FILE, "w") as f:
#         json.dump(users, f, indent=2)

# def create_user(username, password):
#     """Create a new user"""
#     users = load_users()
#     
#     # Check if username already exists
#     if username in users:
#         return False, "Username already exists"
#     
#     # Check if password is already used by another user
#     password_hash = hash_password(password)
#     for existing_user, user_data in users.items():
#         if user_data["password_hash"] == password_hash:
#             return False, "Password is already in use by another user"
#     
#     users[username] = {
#         "password_hash": password_hash,
#         "created_at": time.time()
#     }
#     save_users(users)
#     return True, "User created successfully"

# def authenticate_user(username, password):
#     """Authenticate a user"""
#     users = load_users()
#     if username not in users:
#         return False, "Invalid username or password"
#     
#     if users[username]["password_hash"] != hash_password(password):
#         return False, "Invalid username or password"
#     
#     return True, "Login successful"

# def login_user(username):
#     """Set up user session"""
#     st.session_state.logged_in = True
#     st.session_state.username = username

# def logout_user():
#     """Clear user session"""
#     for key in ["logged_in", "username"]:
#         if key in st.session_state:
#             del st.session_state[key]

