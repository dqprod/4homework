#!/usr/bin/env python3
"""Seed test accounts: 1 parent + 3 children, with linked parent-child relations."""
import uuid, sqlite3, os

DB = os.path.join(os.path.dirname(__file__), "homework.db")

parent_id = str(uuid.uuid4())
children = [
    {"id": str(uuid.uuid4()), "name": "花子", "grade": "小4"},
    {"id": str(uuid.uuid4()), "name": "太郎", "grade": "小3"},
    {"id": str(uuid.uuid4()), "name": "次郎", "grade": "小2"},
]

conn = sqlite3.connect(DB)

# Create profiles
for p in [{"id": parent_id, "role": "parent", "name": "お父さん"}] + [
    {"id": c["id"], "role": "student", "name": f'{c["name"]} ({c["grade"]})'} for c in children
]:
    conn.execute(
        "INSERT OR IGNORE INTO profiles (id, role, full_name) VALUES (?, ?, ?)",
        (p["id"], p["role"], p["name"]),
    )

# Create parent-child links
for c in children:
    conn.execute(
        "INSERT OR IGNORE INTO parent_child (parent_id, child_id) VALUES (?, ?)",
        (parent_id, c["id"]),
    )

conn.commit()

print("=== Test Accounts ===")
print(f"  Parent:  {parent_id}  (お父さん)")
for c in children:
    print(f"  Child:   {c['id']}  {c['name']} ({c['grade']})")
print("\nParent can view all 3 children's progress.")
print("Each child has their own independent learning records.")

# Also ensure subjects are seeded
subjects = [("算数","🔢"),("国语","📖"),("理科","🔬"),("社会","🌏"),("英语","🅰️")]
for i, (name, icon) in enumerate(subjects, 1):
    conn.execute("INSERT OR IGNORE INTO subjects (id, name, icon) VALUES (?, ?, ?)", (i, name, icon))
conn.commit()
conn.close()
print("\nDone.")