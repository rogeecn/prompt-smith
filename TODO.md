# Upgrade Plan: User System & Manual Project Management

## 1. Environment & Dependencies
- [x] Install authentication dependencies (`bcryptjs`, `jose`)
- [x] Install type definitions (`@types/bcryptjs`)
- [ ] Decide migration strategy (use `prisma migrate dev`; avoid `db push` for auth schema)

## 2. Database & Schema
- [ ] Update `prisma/schema.prisma`
    - [ ] Add `User` model (`email`, `password_hash`, `created_at`)
    - [ ] Add unique index on `User.email`
    - [ ] Update `Project` model (add `userId` relation, index)
- [ ] Apply migrations via `prisma migrate dev` (no `db push` for prod data)

## 3. Core Authentication Logic
- [ ] Create `src/lib/auth.ts`
    - [ ] Implement JWT session management (Sign/Verify)
    - [ ] Implement Password Hashing (bcrypt)
    - [ ] Implement Session Cookie helpers
    - [ ] Define cookie name + HttpOnly/SameSite/Secure policy
- [ ] Create `src/middleware.ts`
    - [ ] Implement route protection (redirect guest to `/login`)
    - [ ] Exclude public paths (`/login`, `/register`, static files)
- [ ] Create `src/app/actions/auth.ts`
    - [ ] `register(email, password)`
    - [ ] `login(email, password)`
    - [ ] `logout()`

## 4. UI Implementation: Auth Pages
- [ ] Create Login Page (`src/app/login/page.tsx`)
- [ ] Create Registration Page (`src/app/register/page.tsx`)

## 5. Refactor: Project Management Actions
- [ ] Update `src/app/actions.ts`
    - [ ] Modify `createProject` to accept and require `userId`
    - [ ] Remove auto-creation logic in `loadProjectContext`
    - [ ] Implement `getUserProjects(userId)` to fetch project list
    - [ ] Ensure `userId` security checks in data access
    - [ ] Update any call sites relying on auto-create behavior

## 6. Page & Routing Updates
- [ ] Refactor `src/app/page.tsx` (Root)
    - [ ] Verify session
    - [ ] Render `Dashboard` component (List User Projects) instead of direct Editor
- [ ] Create `src/components/Dashboard.tsx`
    - [ ] Display list of projects
    - [ ] "Create New Project" button
- [ ] Create Project Workspace Route (`src/app/project/[projectId]/page.tsx`)
    - [ ] Render `HomeClient`
    - [ ] Ensure `HomeClient` loads context correctly from URL param
- [ ] Update `/artifacts` and wizard entry to require explicit project selection

## 7. API Security
- [ ] Secure API Routes (`src/app/api/...`)
    - [ ] Verify user session in `api/chat`, `api/models`, `api/artifacts/*`
    - [ ] Enforce project ownership in API queries

## 8. Verification
- [ ] Verify User Registration flow
- [ ] Verify Login/Logout flow
- [ ] Verify Manual Project Creation
- [ ] Verify Access Control (User A cannot see User B's projects)
