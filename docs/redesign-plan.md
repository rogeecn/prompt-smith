# Prompt Smith Redesign Plan: Modern Editorial

## 1. Design Theme: Modern Editorial / Magazine
**Core Concept**: Professional, refined, content-focused. A departure from generic SaaS aesthetics to a style reminiscent of high-end design magazines.

### Visual Language
- **Typography**: Bold hierarchy using Serif headings and Sans-serif body.
- **Color Palette**: Minimalist Black & White with Gold/Amber accents.
- **Layout**: Asymmetrical, grid-breaking, generous whitespace.
- **Details**: Fine 1px lines, square corners (no radius), no drop shadows (flat layer style).

### Design System Tokens

#### Typography
- **Display**: `Playfair Display` (Large titles, logo)
- **Heading**: `Crimson Pro` (Section headers, questions)
- **Body**: `IBM Plex Sans` (UI text, chat content)
- **Mono**: `JetBrains Mono` (Code, variables)

#### Colors
- **Surface**:
  - Background: `#FAFAF9` (Paper White)
  - Card/Block: `#FFFFFF` (Pure White)
  - Sidebar: `#FFFFFF` (Pure White)
- **Text**:
  - Primary: `#0A0A0A` (Almost Black)
  - Secondary: `#737373` (Neutral Gray)
  - Accent: `#D4AF37` (Gold - Selection/Focus)
- **Borders**:
  - Default: `#E5E5E5` (Light Gray)
  - Active: `#D4AF37` (Gold)
  - Strong: `#0A0A0A` (Black)

#### Spacing & Shape
- **Border Radius**: `0px` (Strictly square)
- **Stroke**: `1px` consistent line weight
- **Padding**: Generous. Minimum `24px` for content blocks. `48px` vertical rhythm in chat.

---

## 2. Page Layouts

### A. Global Navigation (TopNav)
- **Style**: Minimal horizontal bar, white background, bottom border.
- **Content**:
  - Left: "PROMPT SMITH" (Playfair Display).
  - Right: "Wizard" | "Artifacts" (Simple text links).
- **Behavior**: Sticky, pure text, no icons.

### B. Wizard / Home Page (2-Column)
- **Left Sidebar (320px)**:
  - "Session History" heading.
  - Simple list of recent sessions.
  - Active state: Left gold border (3px).
  - "New Session" button.
- **Main Chat Area**:
  - Clean white canvas.
  - Simplified message stream (No avatars, just role labels).
  - **Input Area**: Large, multi-line text area at bottom. No complex toolbars. Only "Send".

### C. Artifact Library (3-Column)
- **Left Sidebar (320px)**: Artifact Management.
  - Search bar (Underline style).
  - List of artifacts (Title + short desc).
  - Active state: Left gold border.
- **Center Area (Flex)**: Chat & Interaction.
  - Artifact Title (Display font).
  - Chat stream.
  - Simplified Input.
- **Right Sidebar (280px)**: Context & History.
  - **Session List**: Numbered list of history for *current* artifact.
  - **New Session**: Button to branch off new conversation.
  - **Variables**: Snapshot of variables for the current artifact (Monospace keys).

---

## 3. Component Specifics

### Chat Interface (Simplified)
- **Input**:
  - Removed: Toolbar, Quick Actions, Formatting buttons.
  - Kept: Large textarea, Send button.
  - Style: Minimal, distraction-free.
- **Messages**:
  - Removed: Colorful bubbles, avatars.
  - Style: Editorial text layout. "User" and "Assistant" labels in small caps/gray.

### Question Form
- **Style**: Inline form, no card background.
- **Inputs**: Underline style (`border-b`).
- **Selection**: Custom radio/checkboxes (Square/Circle with gold fill).

### Final Prompt View
- **Style**: Top gold border (3px).
- **Content**: `pre` block with JetBrains Mono.
- **Actions**: Simple text buttons ("Copy", "Save").

---

## 4. Implementation Strategy

1.  **Foundation**:
    - Update `globals.css` with new CSS variables.
    - Configure Fonts in `layout.tsx`.
2.  **Components**:
    - Refactor `TopNav` (simplify).
    - Refactor `MessageBlock` (editorial style).
    - Refactor `QuestionForm` (minimalist).
3.  **Pages**:
    - Rebuild `HomeClient` (2-col).
    - Rebuild `ArtifactsClient` (3-col, adding right sidebar).
    - Update `ChatInterface` (simplify input).
