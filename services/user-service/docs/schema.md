# User Service Database Schema

This document defines the PostgreSQL schema for the User Service.

## Table: `users`

Stores core user profile information.

| Column            | Type           | Constraints                                  | Description                                      |
|-------------------|----------------|----------------------------------------------|--------------------------------------------------|
| `id`              | `UUID`         | `PRIMARY KEY`, `DEFAULT gen_random_uuid()`   | Unique identifier for the user.                  |
| `username`        | `VARCHAR(50)`  | `UNIQUE`, `NOT NULL`                         | User's login name.                               |
| `email`           | `VARCHAR(255)` | `UNIQUE`                                     | User's email address.                            |
| `nickname`        | `VARCHAR(50)`  |                                              | User's display name.                             |
| `gender`          | `INT`          | `CHECK (gender IN (0, 1, 2))`                | 0: Female, 1: Male, 2: Other.                    |
| `birth_year`      | `INT`          |                                              | User's birth year.                               |
| `avatar_url`      | `TEXT`         |                                              | URL for the user's profile picture.              |
| `native_language` | `VARCHAR(50)`  |                                              | User's native language.                          |
| `target_language` | `VARCHAR(50)`  |                                              | User's current primary target language.          |
| `interests`       | `TEXT`         |                                              | Comma separated string or JSON of user interests.|
| `points`          | `INT`          | `DEFAULT 0`                                  | User's gamification points.                      |
| `created_at`      | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT NOW()`                  | Timestamp of user creation.                      |
| `updated_at`      | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT NOW()`                  | Timestamp of last user profile update.           |

## Table: `user_identities`

Links third-party authentication providers to a user account.

| Column          | Type           | Constraints                               | Description                                       |
|-----------------|----------------|-------------------------------------------|---------------------------------------------------|
| `provider`      | `VARCHAR(50)`  | `PRIMARY KEY`                             | Name of the auth provider (e.g., 'google').       |
| `provider_uid`  | `VARCHAR(255)` | `PRIMARY KEY`                             | The user's unique ID from the provider.           |
| `user_id`       | `UUID`         | `FOREIGN KEY`, `REFERENCES users(id)`     | Links to the `users` table.                       |
| `password_hash` | `VARCHAR(255)` |                                           | Encrypted password (for local auth).              |
| `created_at`    | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT NOW()`               | Timestamp of identity creation.                   |

## Table: `user_goals`

Stores specific learning goals for the user.

| Column               | Type           | Constraints                               | Description                                       |
|----------------------|----------------|-------------------------------------------|---------------------------------------------------|
| `id`                 | `SERIAL`       | `PRIMARY KEY`                             | Unique identifier for the goal.                   |
| `user_id`            | `UUID`         | `FOREIGN KEY`, `REFERENCES users(id)`     | Links to the `users` table.                       |
| `type`               | `VARCHAR(50)`  |                                           | Goal type (e.g., business_meeting).               |
| `description`        | `TEXT`         |                                           | Specific goal description.                        |
| `target_language`    | `VARCHAR(50)`  | `NOT NULL`                                | Target language for this goal.                    |
| `target_level`       | `VARCHAR(20)`  | `NOT NULL`                                | Target proficiency level.                         |
| `current_proficiency`| `INT`          | `DEFAULT 0`                               | Current proficiency score (0-100).                |
| `completion_time_days`| `INT`         |                                           | Expected completion time in days.                 |
| `interests`          | `TEXT`         |                                           | Goal-specific interests.                          |
| `status`             | `VARCHAR(20)`  | `DEFAULT 'active'`                        | Goal status (active, completed, abandoned).       |
| `created_at`         | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT NOW()`               | Timestamp of goal creation.                       |
| `completed_at`       | `TIMESTAMPTZ`  |                                           | Timestamp of goal completion.                     |