# Config UI Improvements - Design Specification

## Overview

This document captures comprehensive design instructions and concrete changesets to bring the Clawdbrain Config/Settings UI up to modern UX standards. It is based on analysis of three Magic MCP reference designs (shadcn/ui + Ark UI patterns) and current pain points observed during iterative design sessions.

**Stack:** Lit 3.3.2 templates, vanilla CSS with custom properties, JSON Schema-driven form rendering.

**Key files:**

- `ui/src/styles/config.css` - All config page styles
- `ui/src/ui/views/config.ts` - Main config view rendering
- `ui/src/ui/views/config-form.render.ts` - Form section/subsection rendering
- `ui/src/ui/views/config-form.node.ts` - Individual field rendering (text, number, select, toggle, object, array, map)
- `ui/src/ui/views/config-form.shared.ts` - Shared utilities (humanize, hintForPath, schemaType, etc.)

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Changes Already Completed](#2-changes-already-completed)
3. [Magic MCP Reference Designs](#3-magic-mcp-reference-designs)
4. [UX Pattern Analysis](#4-ux-pattern-analysis)
5. [Improvement Areas](#5-improvement-areas)
6. [Concrete Changesets](#6-concrete-changesets)
7. [Priority Ordering](#7-priority-ordering)

---

## 1. Design Principles

These principles guide all changes:

1. **Every input must be self-describing.** Labels above inputs, help text below. No orphaned fields.
2. **Interactive elements must look interactive.** Borders, backgrounds, hover states, focus rings, chevrons for navigation.
3. **Visual hierarchy through spacing and grouping.** Use consistent vertical rhythm (`gap: 14px` between fields, `gap: 24px` between groups/sections).
4. **Minimalist but not spartan.** Subtle borders, gentle backgrounds, accent colors for active states. Avoid decoration for its own sake.
5. **Dark mode first.** All colors via CSS custom properties. Light mode overrides via `:root[data-theme="light"]`.
6. **Consistency.** Same border radius, same padding, same transition timing across all form controls.

---

## 2. Changes Already Completed

These improvements were implemented in prior sessions and should NOT be reverted:

### 2a. Status Overview Grid

- Added `--configured` class with green left accent bar
- Added `--unset` class with dashed border and dimmed icon
- Added right chevron to indicate clickability
- Added icon background circles

### 2b. Collapsible Panel Headers

- Fixed center-aligned titles: changed from `justify-content: space-between` to `gap: 10px` + `flex: 1` on title
- Title now left-aligns near the disclosure icon

### 2c. Segmented Controls

- Added visible borders and elevated backgrounds to inactive buttons
- Active state uses accent color fill with `font-weight: 600`
- Added hover, focus-visible, and disabled states

### 2d. Subsection Intro Blocks

- When navigating to a subsection tab, a description block now shows the subsection label and help text
- Styled with left accent border and subtle background

### 2e. Unsaved Changes UX

- Replaced collapsible "Quick Preview" panel with clickable "Unsaved Changes (N)" badge
- Badge opens native `<dialog>` modal with the pending diff
- Removed redundant "Copy pending changes" and "View pending changes" buttons

---

## 3. Magic MCP Reference Designs

### Reference 1: Quick Settings Dialog (shadcn/ui)

**Pattern:** Clean dialog with icon + label + switch rows, grouped sections with `<hr>` dividers.

**Key UX patterns observed:**

- Toggle rows: `flex items-center justify-between` with icon + label on left, switch on right
- Section dividers via `<hr className="my-4" />`
- Consistent `space-y-4` vertical rhythm
- Settings icon in dialog title for visual anchoring

```tsx
// Quick Settings Dialog - shadcn/ui Dialog + Switch
import React from "react";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, Bell, Globe, Shield } from "lucide-react";

export default function QuickSettingsDialog() {
  const [settings, setSettings] = React.useState({
    notifications: true,
    publicProfile: false,
    twoFactor: true,
    darkMode: false,
    emailUpdates: true,
  });

  const toggleSetting = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key as keyof typeof settings],
    }));
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Quick Settings</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center sm:justify-start gap-2">
            <Settings className="h-5 w-5" />
            Quick Settings
          </DialogTitle>
          <DialogDescription>Manage your account preferences</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                <span className="text-sm">Push Notifications</span>
              </div>
              <Switch
                checked={settings.notifications}
                onCheckedChange={() => toggleSetting("notifications")}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span className="text-sm">Public Profile</span>
              </div>
              <Switch
                checked={settings.publicProfile}
                onCheckedChange={() => toggleSetting("publicProfile")}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="text-sm">Two-Factor Authentication</span>
              </div>
              <Switch
                checked={settings.twoFactor}
                onCheckedChange={() => toggleSetting("twoFactor")}
              />
            </div>
            <hr className="my-4" />
            <div className="flex items-center justify-between">
              <span className="text-sm">Dark Mode</span>
              <Switch
                checked={settings.darkMode}
                onCheckedChange={() => toggleSetting("darkMode")}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Email Updates</span>
              <Switch
                checked={settings.emailUpdates}
                onCheckedChange={() => toggleSetting("emailUpdates")}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={() => alert("Settings saved!")}>Save Changes</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**shadcn/ui Dialog component code:**

```tsx
"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 bg-background/50 fixed inset-0 z-50 backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-lg border shadow-lg duration-200 sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("px-4 py-6", className)} {...props} />;
}

function DialogHeader({
  className,
  children,
  hideCloseButton = false,
  ...props
}: React.ComponentProps<"div"> & { hideCloseButton?: boolean }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "bg-muted/30 flex flex-col gap-2 rounded-t-lg border-b p-4 text-center sm:text-left",
        className,
      )}
      {...props}
    >
      {children}
      {!hideCloseButton && (
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-full opacity-80 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "bg-muted/30 flex flex-col gap-2 rounded-b-lg border-t px-4 py-3 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-lg leading-none font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
```

### Reference 2: Settings Card (shadcn/ui Card + Tabs)

**Pattern:** Tabbed settings with proper Labels above every input, Select dropdowns with trigger/content pattern.

**Key UX patterns observed:**

- Card wrapper with header (title + description) and footer (save button)
- Tabs with `grid-cols-2` tab list above content
- `space-y-2` within each field group (label + input)
- `space-y-4` between field groups
- Labels use `htmlFor` to connect to inputs
- Select has visible trigger with `SelectValue placeholder="Select..."` pattern

```tsx
// Settings Card - shadcn/ui Card + Tabs + Select + Switch + Input
"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SettingsCard() {
  const [activeTab, setActiveTab] = useState("account");

  return (
    <Card className="w-[310px]">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Manage your account settings and preferences.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            <div className="space-y-4 py-2">
              <div className="space-y-2 mt-5">
                <Label htmlFor="username">Username</Label>
                <Input id="username" placeholder="Enter username" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="Enter email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select>
                  <SelectTrigger id="language">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="notifications">
            <div className="space-y-4 py-2">
              <div className="flex items-center space-x-2">
                <Switch id="emailNotifications" />
                <Label htmlFor="emailNotifications">Email Notifications</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="pushNotifications" />
                <Label htmlFor="pushNotifications">Push Notifications</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="weeklyDigest" />
                <Label htmlFor="weeklyDigest">Weekly Digest</Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Save Changes</Button>
      </CardFooter>
    </Card>
  );
}
```

### Reference 3: Settings Panel (Ark UI FloatingPanel)

**Pattern:** Grouped sections with headings, custom toggle switches, native select with full styling.

**Key UX patterns observed:**

- Section headings: `<h3 className="text-sm font-medium mb-3">Section Name</h3>`
- Settings grouped by category (General, Language, Audio, Help & Tips)
- `space-y-6` between section groups, `space-y-3` between items within a group
- Native `<select>` with explicit border, rounded corners, and focus ring styling
- Action buttons at bottom with `border-t` separator
- Toggle switches: `h-5 w-9` track with `h-3 w-3` thumb, `bg-blue-600` when on, `bg-gray-300 dark:bg-gray-600` when off

```tsx
// Settings Panel - Ark UI FloatingPanel with grouped settings sections
"use client";

import { FloatingPanel } from "@ark-ui/react/floating-panel";
import { Portal } from "@ark-ui/react/portal";
import { Settings, X, Maximize2, Minus, ArrowDownLeft } from "lucide-react";
import { useState } from "react";

export default function SettingsPanel() {
  const [settings, setSettings] = useState({
    notifications: true,
    darkMode: false,
    language: "en",
    autoSave: true,
    showTips: true,
    soundEnabled: false,
  });

  const updateSetting = (key: string, value: boolean | string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <FloatingPanel.Root defaultSize={{ width: 360, height: 510 }}>
      <FloatingPanel.Trigger className="...">
        <Settings className="w-4 h-4" />
        Open Settings
      </FloatingPanel.Trigger>
      <Portal>
        <FloatingPanel.Positioner className="z-50">
          <FloatingPanel.Content className="flex flex-col bg-white dark:bg-gray-900 rounded-lg border ...">
            {/* Header */}
            <FloatingPanel.DragTrigger>
              <FloatingPanel.Header className="py-2 px-4 bg-gray-50 dark:bg-gray-800 border-b ...">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  <FloatingPanel.Title className="font-medium text-gray-900 dark:text-gray-100">
                    Settings
                  </FloatingPanel.Title>
                </div>
              </FloatingPanel.Header>
            </FloatingPanel.DragTrigger>

            <FloatingPanel.Body className="flex flex-col gap-4 p-4 overflow-y-auto">
              <div className="space-y-6">
                {/* General Settings */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                    General
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-700 dark:text-gray-300">
                        Enable notifications
                      </label>
                      <button
                        onClick={() => updateSetting("notifications", !settings.notifications)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          settings.notifications ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            settings.notifications ? "translate-x-5" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                    {/* ... more toggle rows ... */}
                  </div>
                </div>

                {/* Language Settings */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                    Language
                  </h3>
                  <select
                    value={settings.language}
                    onChange={(e) => updateSetting("language", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="en">English</option>
                    <option value="es">Espanol</option>
                    <option value="fr">Francais</option>
                    <option value="de">Deutsch</option>
                    <option value="zh">Chinese</option>
                  </select>
                </div>

                {/* Audio Settings */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Audio</h3>
                  <div className="space-y-3">{/* toggle rows */}</div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                    Save Changes
                  </button>
                  <button className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    Reset
                  </button>
                </div>
              </div>
            </FloatingPanel.Body>
          </FloatingPanel.Content>
        </FloatingPanel.Positioner>
      </Portal>
    </FloatingPanel.Root>
  );
}
```

### Reference 4: Field Components (shadcn/ui Field)

**Pattern:** Structured form fields with explicit label, description, and error slots.

**Key UX patterns observed:**

- `Field` > `FieldLabel` > `Input` > `FieldDescription` vertical stack
- `FieldGroup` provides consistent `gap-7` between fields
- `FieldSet` wraps multiple `FieldGroup`s with `gap-6`
- `FieldDescription` uses `text-muted-foreground text-sm` for help text
- `FieldSeparator` component for visual dividers between groups
- `FieldError` component with `role="alert"` for accessible validation

```tsx
// Field input pattern
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field-1";
import { Input } from "@/components/ui/input";

export default function FieldInput() {
  return (
    <div className="w-full max-w-md">
      <FieldSet>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <Input id="username" type="text" placeholder="Max Leiter" />
            <FieldDescription>Choose a unique username for your account.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <FieldDescription>Must be at least 8 characters long.</FieldDescription>
            <Input id="password" type="password" placeholder="********" />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
```

**Field component code (key classes):**

```tsx
// FieldSet: "flex flex-col gap-6"
// FieldGroup: "flex w-full flex-col gap-7"
// Field: "flex w-full gap-3 flex-col [&>*]:w-full"
// FieldLabel: "flex w-fit gap-2 leading-snug text-sm font-medium"
// FieldDescription: "text-muted-foreground text-sm leading-normal font-normal"
// FieldError: "text-destructive text-sm font-normal" with role="alert"
// FieldSeparator: Horizontal separator between field groups
```

---

## 4. UX Pattern Analysis

### Patterns common across ALL reference designs:

| Pattern                | Current State          | Target State                                                              |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------- |
| **Field internal gap** | `5px` (`.cfg-field`)   | `8px` - more breathing room between label, input, help text               |
| **Field group gap**    | `14px` (`.cfg-fields`) | `14-16px` - already close, keep or bump to 16px                           |
| **Labels**             | 12px/600 weight        | Good. Keep. Consider bumping to 13px for readability                      |
| **Help text**          | 12px muted             | Good. Ensure every field has help when available from schema              |
| **Section grouping**   | Flat list of fields    | Group related fields with section headings + dividers                     |
| **Select styling**     | Has border/chevron     | Good after recent fixes. Consider stronger contrast on trigger            |
| **Toggle rows**        | Card-style with border | Good. Already matches reference patterns                                  |
| **Segmented controls** | Recently fixed         | Good. Active uses accent fill                                             |
| **Vertical rhythm**    | Inconsistent           | Standardize: 8px within field, 16px between fields, 24px between sections |
| **Focus states**       | Present but subtle     | Ensure all interactive elements have visible focus ring                   |
| **Disabled states**    | `opacity: 0.5`         | Good. Consistent with references                                          |

### Critical gaps between current and reference designs:

1. **No section headings within forms.** When a subsection has many fields (e.g., Gateway settings), they appear as a flat list. References show grouped sections with headings.
2. **Field gap too tight.** `5px` between label/input/help makes things feel cramped. All references use `gap-3` (12px) or `gap-2` (8px) minimum.
3. **Missing descriptions on many fields.** Schema `description` properties aren't always surfaced. Need to ensure `cfg-field__help` is rendered whenever schema provides a description.
4. **No field separators.** Long forms have no visual breaks. References use `<hr>`, `border-t`, or `FieldSeparator`.
5. **Select trigger in dark mode.** While styled, the `cfg-select` could use stronger border contrast in dark mode.

---

## 5. Improvement Areas

### Area 1: Field Internal Spacing

**Problem:** `.cfg-field` has `gap: 5px`, making label-input-help feel cramped.

**CSS Change:**

```css
/* Before */
.cfg-field {
  display: grid;
  gap: 5px;
}

/* After */
.cfg-field {
  display: grid;
  gap: 8px;
}
```

### Area 2: Field Label Sizing

**Problem:** Labels at 12px can be hard to read, especially in dark mode.

**CSS Change:**

```css
/* Before */
.cfg-field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

/* After */
.cfg-field__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.01em;
}
```

### Area 3: Section Dividers in Long Forms

**Problem:** When a config section has many properties (e.g., gateway with port, mode, auth, binding, etc.), they appear as a flat undifferentiated list.

**Approach:** Add a CSS class for section dividers that can be injected between logical groups of fields in `config-form.node.ts`.

**CSS Addition:**

```css
/* Field group divider */
.cfg-field-divider {
  height: 1px;
  background: var(--border);
  margin: 8px 0;
  opacity: 0.5;
}

/* Field group heading (optional, for subsections within a section) */
.cfg-field-group-heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-top: 12px;
  margin-bottom: -4px;
}
```

**TypeScript Change (config-form.node.ts):** In `renderObject()`, when rendering properties of a section that has grouped ui hints, insert `<div class="cfg-field-divider"></div>` between groups.

### Area 4: Help Text on Every Field

**Problem:** Many fields render without help text even when the JSON schema provides a `description`.

**TypeScript Change (config-form.node.ts):** In each `renderTextInput()`, `renderNumberInput()`, `renderSelect()`, etc., ensure:

```typescript
// Current: help text only if hints provide it
const help = hint?.help ?? schema.description ?? "";

// Ensure we render it:
${help ? html`<div class="cfg-field__help">${help}</div>` : nothing}
```

This is already partially done but should be audited across ALL field renderers to ensure consistency.

### Area 5: Enhanced Select Trigger (Dark Mode)

**Problem:** The `cfg-select` blends with the dark background. References show selects with stronger borders.

**CSS Change:**

```css
/* Before */
.cfg-select {
  border: 1px solid var(--border-strong);
  /* ... */
}

/* After */
.cfg-select {
  border: 1px solid var(--border-strong);
  /* ... */
}

/* Enhance dark mode contrast */
.cfg-select:hover:not(:disabled) {
  border-color: var(--accent);
  background-color: var(--bg-hover);
}
```

### Area 6: Consistent Focus Rings

**Problem:** Some controls have focus rings, others don't. References use `focus:ring-2 focus:ring-ring focus:ring-offset-2` consistently.

**CSS Change:** Add to any controls missing focus states:

```css
/* Ensure all interactive form controls have focus ring */
.cfg-input:focus-visible,
.cfg-textarea:focus-visible,
.cfg-select:focus-visible {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
  outline: none;
}
```

### Area 7: Toggle Row Polish

**Problem:** Toggle rows are already card-style which is good. Minor polish: ensure help text wraps properly and the switch is vertically centered with the label (not the full card).

**CSS Change:**

```css
/* Ensure toggle switch aligns with first line of label */
.cfg-toggle-row {
  align-items: flex-start; /* was: center */
}

.cfg-toggle-row .cfg-toggle {
  margin-top: 2px; /* align with text baseline */
}
```

### Area 8: Collapsible Object Spacing

**Problem:** Nested objects (rendered as `<details>`) can feel tight when opened.

**CSS Change:**

```css
/* Add breathing room inside expanded objects */
.cfg-object__body {
  padding: 16px 18px; /* ensure consistent */
}

/* Separator between object header and body */
.cfg-object[open] > .cfg-object__header {
  border-bottom: 1px solid var(--border);
}
```

### Area 9: Empty State Polish

**Problem:** When search finds nothing, the empty state is functional but plain.

**CSS Change:**

```css
.config-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  color: var(--muted);
}

.config-empty__icon {
  opacity: 0.3;
  width: 48px;
  height: 48px;
}

.config-empty__text {
  font-size: 14px;
  text-align: center;
  max-width: 280px;
  line-height: 1.5;
}
```

### Area 10: Action Bar Alignment

**Problem:** The action bar buttons can feel crowded on smaller screens.

**CSS Change:**

```css
.config-actions {
  gap: 12px; /* ensure enough gap */
}

.config-actions__right {
  gap: 8px; /* between action buttons */
}
```

---

## 6. Concrete Changesets

### Changeset 1: Field Spacing & Labels (config.css)

**File:** `ui/src/styles/config.css`
**Lines:** ~1065-1095

```css
/* BEFORE */
.cfg-field {
  display: grid;
  gap: 5px;
}

.cfg-field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

/* AFTER */
.cfg-field {
  display: grid;
  gap: 8px;
}

.cfg-field__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.01em;
}
```

### Changeset 2: Field Group Dividers & Headings (config.css)

**File:** `ui/src/styles/config.css`
**Location:** After `.cfg-field__error` block (~line 1097)

```css
/* Field group divider - visual break between logical groups */
.cfg-field-divider {
  height: 1px;
  background: var(--border);
  margin: 8px 0;
  opacity: 0.5;
}

/* Field group heading - category label within a section */
.cfg-field-group-heading {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-top: 12px;
  margin-bottom: -4px;
}
```

### Changeset 3: Select Hover Enhancement (config.css)

**File:** `ui/src/styles/config.css`
**Location:** After `.cfg-select:focus` block (~line 1278)

```css
/* Add hover state for select */
.cfg-select:hover:not(:disabled):not(:focus) {
  border-color: var(--border-strong);
  background-color: var(--bg-hover);
}
```

### Changeset 4: Toggle Row Vertical Alignment (config.css)

**File:** `ui/src/styles/config.css`
**Location:** `.cfg-toggle-row` block (~line 1345)

```css
/* Only change if toggle has help text to prevent misalignment */
.cfg-toggle-row:has(.cfg-toggle-row__help) {
  align-items: flex-start;
}

.cfg-toggle-row:has(.cfg-toggle-row__help) .cfg-toggle {
  margin-top: 2px;
}
```

### Changeset 5: Collapsible Object Border (config.css)

**File:** `ui/src/styles/config.css`
**Location:** After `.cfg-object__header` block

```css
/* Visual separator when object is expanded */
.cfg-object[open] > .cfg-object__header {
  border-bottom: 1px solid var(--border);
}
```

### Changeset 6: Audit Help Text Rendering (config-form.node.ts)

**File:** `ui/src/ui/views/config-form.node.ts`
**Task:** Audit every `render*` function to ensure schema.description is passed through as help text.

In each field renderer, ensure this pattern:

```typescript
const hint = hintForPath(path, hints);
const label = hint?.label ?? schema.title ?? humanize(path[path.length - 1] as string);
const help = hint?.help ?? schema.description ?? "";

// ... in template:
${help ? html`<div class="cfg-field__help">${help}</div>` : nothing}
```

Functions to audit:

- `renderTextInput()` - likely already done
- `renderNumberInput()` - check
- `renderSelect()` - check (for both `<select>` and segmented)
- `renderObject()` - header area
- `renderArray()` - help text for the array itself
- `renderMapField()` - help text for the map

### Changeset 7: UI Hints - Section Grouping Support

**File:** `ui/src/ui/views/config-form.node.ts`
**Task:** When rendering an object's properties, check for a `group` ui hint. If properties have group hints, render them in groups with headings and dividers.

**Proposed ui hint format:**

```typescript
// In ConfigUiHints, add optional group to field hints:
{
  "gateway": {
    "port": { "group": "Server" },
    "mode": { "group": "Server" },
    "auth": { "group": "Authentication" },
    "bind": { "group": "Network" },
    "allowedOrigins": { "group": "Network" }
  }
}
```

**Rendering logic:**

```typescript
// In renderObject(), group properties by their group hint:
const groups = new Map<string, Array<[string, JsonSchema]>>();
for (const [key, prop] of entries) {
  const groupName = hintForPath([...path, key], hints)?.group ?? "";
  if (!groups.has(groupName)) groups.set(groupName, []);
  groups.get(groupName)!.push([key, prop]);
}

// Render each group with optional heading:
return html`
  <div class="cfg-fields">
    ${[...groups.entries()].map(([groupName, fields], idx) => html`
      ${groupName && idx > 0 ? html`<div class="cfg-field-divider"></div>` : nothing}
      ${groupName ? html`<div class="cfg-field-group-heading">${groupName}</div>` : nothing}
      ${fields.map(([key, prop]) => renderField(key, prop, ...))}
    `)}
  </div>
`;
```

---

## 7. Priority Ordering

### P0 - Do First (High Impact, Low Effort)

1. **Changeset 1: Field Spacing & Labels** - Single CSS change, immediately improves readability
2. **Changeset 3: Select Hover Enhancement** - Single CSS rule, makes selects feel more interactive
3. **Changeset 5: Collapsible Object Border** - Single CSS rule, clarifies expanded state

### P1 - Do Next (High Impact, Medium Effort)

4. **Changeset 6: Audit Help Text Rendering** - Requires checking each renderer in config-form.node.ts
5. **Changeset 4: Toggle Row Vertical Alignment** - CSS only, improves toggle rows with multi-line labels

### P2 - Do Later (Medium Impact, Medium Effort)

6. **Changeset 2: Field Group Dividers & Headings** - New CSS classes, need to decide where to insert dividers
7. **Changeset 7: UI Hints Section Grouping** - Requires both code changes and ui hint data authoring

### P3 - Future Consideration

8. **Toast/notification integration** for save/apply feedback (references show inline feedback patterns)
9. **Animated transitions** for section switching (fade-in/slide patterns from references)
10. **Keyboard navigation improvements** - Tab order, arrow keys within segmented controls

---

## Appendix: Design Tokens Reference

Current CSS custom properties used by config UI:

| Token             | Purpose                         |
| ----------------- | ------------------------------- |
| `--accent`        | Primary accent color (orange)   |
| `--text`          | Primary text color              |
| `--muted`         | Secondary/help text color       |
| `--border`        | Default border color            |
| `--border-strong` | Stronger border (form controls) |
| `--bg-accent`     | Input/control background        |
| `--bg-elevated`   | Raised surface background       |
| `--bg-hover`      | Hover state background          |
| `--surface-1`     | Card surface level 1            |
| `--surface-2`     | Card surface level 2            |
| `--panel`         | Main panel background           |
| `--radius-sm`     | Small border radius             |
| `--radius-md`     | Medium border radius            |
| `--radius-xl`     | Large border radius             |
| `--duration-fast` | Fast transition timing          |
| `--shadow-sm`     | Small shadow                    |
| `--focus-ring`    | Focus ring box-shadow           |
| `--danger`        | Error/danger color              |
| `--danger-subtle` | Subtle danger background        |
| `--mono`          | Monospace font family           |
