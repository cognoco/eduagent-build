---
name: chrome-interaction
description: >
  How to interactively browse, click, type, and automate tasks in Google Chrome
  using the Claude in Chrome MCP tools. Use this skill whenever you need to
  interact with a web browser — navigating to URLs, reading page content,
  clicking buttons, filling forms, testing web apps, scraping data, taking
  screenshots, recording GIFs, debugging with console/network logs, or any
  task that involves controlling Chrome programmatically. Trigger on phrases
  like "open in Chrome", "go to this website", "click the button", "fill out
  this form", "test this web app", "take a screenshot", "check the page",
  "browse to", "sign in to", "look at this page", or any task that implies
  browser interaction — even if the user doesn't explicitly say "Chrome".
---

# Chrome Interaction Skill

This skill teaches you how to drive Google Chrome interactively using the
**Claude in Chrome** MCP tools. You can navigate pages, read their structure,
click elements, fill forms, take screenshots, run JavaScript, inspect network
traffic, and more.

## The Golden Rule: Always Start with Tab Context

Every Chrome session begins the same way. Before you touch anything else, call
`tabs_context_mcp` to discover which tabs exist and get their IDs:

```
tabs_context_mcp(createIfEmpty: true)
```

This returns a list of tab IDs in your MCP tab group. Every other Chrome tool
requires a `tabId` parameter — without this step, you have no valid IDs and
every call will fail.

If the user already has a tab open with the page they want you to work on,
you'll see it in the returned list. If not, create a new tab with
`tabs_create_mcp` and then navigate it.

**Common mistake:** Trying to use a tabId of `0` or guessing IDs. Always get
real IDs from `tabs_context_mcp` first.


## Core Workflow

A typical Chrome interaction follows this sequence:

1. **Get tab context** → `tabs_context_mcp`
2. **Navigate** (if needed) → `navigate`
3. **Understand the page** → `read_page` or `screenshot`
4. **Find specific elements** → `find` or `read_page` with filters
5. **Interact** → `computer` (click, type, scroll) or `form_input`
6. **Verify results** → `screenshot` or `read_page` again

You'll repeat steps 3–6 as many times as needed. Think of it like a human
using a browser: look at the page, find what you need, interact with it,
check what happened.


## Tool Reference

### Navigation

**`navigate`** — Go to a URL or move through browser history.

```
navigate(tabId: 123, url: "https://example.com")
navigate(tabId: 123, url: "back")     // browser back
navigate(tabId: 123, url: "forward")  // browser forward
```

You can omit the protocol — it defaults to `https://`. Use `"back"` and
`"forward"` for history navigation.


### Reading the Page

You have three ways to understand what's on a page, each suited to different
situations:

**`read_page`** — Returns an accessibility tree of page elements with
reference IDs you can use to interact with them. This is your primary tool
for understanding page structure.

```
read_page(tabId: 123)                          // full tree
read_page(tabId: 123, filter: "interactive")   // only buttons, links, inputs
read_page(tabId: 123, ref_id: "ref_42")        // subtree under one element
read_page(tabId: 123, depth: 5)                // limit tree depth
```

The output can be large. If it exceeds the character limit, narrow your scope:
use `filter: "interactive"` to see only clickable/typeable elements, reduce
`depth`, or focus on a `ref_id` subtree. Each element gets a `ref_id` like
`"ref_1"`, `"ref_2"` — you'll use these with `form_input`, `file_upload`,
`computer` (via the `ref` parameter), and `scroll_to`.

**`get_page_text`** — Extracts the plain text content of the page, stripping
HTML. Best for reading articles, blog posts, or any text-heavy page where you
care about the content rather than the structure.

```
get_page_text(tabId: 123)
```

**`computer` with `screenshot`** — Takes a visual screenshot. Essential when
you need to see what the page actually looks like (layout, colors, images,
visual bugs) rather than just its DOM structure.

```
computer(action: "screenshot", tabId: 123)
```

**When to use which:**

| Goal | Tool |
|------|------|
| Find a button or input to interact with | `read_page` (filter: "interactive") |
| Understand full page structure | `read_page` |
| Read an article or text content | `get_page_text` |
| See what the page looks like visually | `computer` (screenshot) |
| Inspect a tiny UI element up close | `computer` (zoom) |


### Finding Elements

**`find`** — Search for elements using natural language. Returns matching
elements with reference IDs.

```
find(tabId: 123, query: "login button")
find(tabId: 123, query: "search input field")
find(tabId: 123, query: "product title containing organic")
```

This is extremely useful when `read_page` returns a huge tree and you just
need one specific element. The query is flexible — describe the element by
its purpose, visible text, or role.


### Clicking and Interacting

**`computer`** — The main interaction tool. Supports many actions:

**Clicking:**
```
computer(action: "left_click", tabId: 123, coordinate: [500, 300])
computer(action: "left_click", tabId: 123, ref: "ref_5")  // click by ref
computer(action: "right_click", tabId: 123, coordinate: [500, 300])
computer(action: "double_click", tabId: 123, coordinate: [500, 300])
computer(action: "triple_click", tabId: 123, coordinate: [500, 300])
```

You can click by pixel coordinate OR by element reference. Using `ref` is
more reliable when you have one from `read_page` or `find`. When using
coordinates, take a screenshot first to confirm positions — don't guess.

**Modifier clicks** (ctrl+click, shift+click, etc.):
```
computer(action: "left_click", tabId: 123, coordinate: [500, 300], modifiers: "ctrl")
computer(action: "left_click", tabId: 123, coordinate: [500, 300], modifiers: "ctrl+shift")
```

**Typing text:**
```
computer(action: "type", tabId: 123, text: "Hello, world!")
```

This types into whatever element currently has focus. Click an input first,
then type. For typing into a specific form field, prefer `form_input` (see
below) — it's more reliable.

**Pressing keys:**
```
computer(action: "key", tabId: 123, text: "Enter")
computer(action: "key", tabId: 123, text: "Tab")
computer(action: "key", tabId: 123, text: "ctrl+a")          // select all
computer(action: "key", tabId: 123, text: "Backspace", repeat: 10)  // repeat key
```

Keys are space-separated for sequences. Use `repeat` to press a key multiple
times (up to 100).

**Scrolling:**
```
computer(action: "scroll", tabId: 123, coordinate: [500, 400], scroll_direction: "down")
computer(action: "scroll", tabId: 123, coordinate: [500, 400], scroll_direction: "down", scroll_amount: 5)
computer(action: "scroll_to", tabId: 123, ref: "ref_42")  // scroll element into view
```

`scroll_to` with a ref is the most reliable way to bring a specific element
into view.

**Hovering** (for tooltips, dropdown menus):
```
computer(action: "hover", tabId: 123, coordinate: [500, 300])
```

**Drag and drop:**
```
computer(action: "left_click_drag", tabId: 123, start_coordinate: [100, 200], coordinate: [400, 200])
```

**Waiting:**
```
computer(action: "wait", tabId: 123, duration: 3)  // wait up to 10 seconds
```

Use sparingly — only when you need to wait for an animation, page load, or
async operation.

**Zooming in** (for inspecting small elements):
```
computer(action: "zoom", tabId: 123, region: [100, 200, 300, 400])
```

Returns a close-up screenshot of the specified rectangular region. Useful
when you can't tell what a small icon or text says from a full screenshot.


### Form Input

**`form_input`** — Set values on form elements directly using their reference
ID. More reliable than click-then-type for filling forms.

```
form_input(tabId: 123, ref: "ref_7", value: "user@example.com")   // text input
form_input(tabId: 123, ref: "ref_8", value: "Option B")           // select dropdown
form_input(tabId: 123, ref: "ref_9", value: true)                 // checkbox
```

The workflow is:
1. `read_page(filter: "interactive")` to find form elements and their refs
2. `form_input` for each field
3. `computer(action: "left_click")` on the submit button

This is significantly more reliable than clicking into each field and typing,
especially for dropdowns and checkboxes.


### File Uploads

**`file_upload`** — Upload files from the local filesystem to a file input.

```
file_upload(tabId: 123, ref: "ref_12", paths: ["/path/to/file.pdf"])
```

**Important:** Do NOT click file upload buttons — that opens a native file
picker dialog you cannot see or interact with. Instead, find the file input
element with `read_page` or `find`, then use `file_upload` with its ref.

**`upload_image`** — Upload a previously captured screenshot or user-uploaded
image to a file input or drag-and-drop target.

```
upload_image(tabId: 123, imageId: "screenshot_abc", ref: "ref_12")
upload_image(tabId: 123, imageId: "screenshot_abc", coordinate: [500, 300])
```

Use `ref` for file inputs, `coordinate` for drag-and-drop targets.


### Tab Management

```
tabs_context_mcp(createIfEmpty: true)  // get all tabs in your group
tabs_create_mcp()                       // create a new empty tab
tabs_close_mcp(tabId: 123)            // close a tab
```

Each conversation should create its own new tab rather than reusing existing
ones, unless the user explicitly asks to use an existing tab.

If you close the last tab in the group, the group is removed — the next
`tabs_context_mcp(createIfEmpty: true)` starts fresh.


### Screenshots and GIFs

**Screenshots:**
```
computer(action: "screenshot", tabId: 123)                        // view only
computer(action: "screenshot", tabId: 123, save_to_disk: true)    // save for sharing
```

Use `save_to_disk: true` only when you intend to share the screenshot with
the user. Regular screenshots you're just using to orient yourself don't
need saving.

**GIF Recording** — Record your interactions as an animated GIF:
```
gif_creator(action: "start_recording", tabId: 123)
// Take a screenshot immediately to capture the first frame
computer(action: "screenshot", tabId: 123)
// ... perform your interactions ...
// Take a screenshot to capture the final frame
computer(action: "screenshot", tabId: 123)
gif_creator(action: "stop_recording", tabId: 123)
gif_creator(action: "export", tabId: 123, download: true)
gif_creator(action: "clear", tabId: 123)   // clean up when done
```

The GIF includes visual overlays (click indicators, action labels, progress
bar). You can customize these via the `options` parameter on export.


### Debugging

**`read_console_messages`** — Read browser console output (logs, errors,
warnings).

```
read_console_messages(tabId: 123, pattern: "error|warning")
read_console_messages(tabId: 123, onlyErrors: true)
read_console_messages(tabId: 123, pattern: "api", clear: true)
```

Always provide a `pattern` to filter — without one you'll get flooded with
irrelevant messages. Use `clear: true` to avoid seeing the same messages on
subsequent calls.

**`read_network_requests`** — Inspect HTTP requests the page is making.

```
read_network_requests(tabId: 123)
read_network_requests(tabId: 123, urlPattern: "/api/")
read_network_requests(tabId: 123, urlPattern: "graphql", clear: true)
```

Useful for debugging API calls, checking what data a page is loading, or
verifying that form submissions sent the right data.

**`javascript_tool`** — Run JavaScript directly in the page context.

```
javascript_tool(action: "javascript_exec", tabId: 123,
                text: "document.title")
javascript_tool(action: "javascript_exec", tabId: 123,
                text: "document.querySelectorAll('.error').length")
```

The result of the last expression is returned. Do NOT use `return` statements
— just write the expression. This is powerful for checking page state,
extracting data, or manipulating the DOM when other tools aren't sufficient.


### Advanced

**`resize_window`** — Change browser window dimensions (useful for responsive
testing):
```
resize_window(tabId: 123, width: 375, height: 812)   // iPhone-sized
resize_window(tabId: 123, width: 1920, height: 1080)  // desktop
```

**`switch_browser`** — Connect to a different Chrome browser (the user must
click "Connect" in the target browser).

**`shortcuts_list`** / **`shortcuts_execute`** — List and run Chrome extension
shortcuts/workflows.


## Recipes

### Sign into a website

```
1. tabs_context_mcp(createIfEmpty: true)           → get tabId
2. navigate(tabId, url: "https://app.example.com") → go to login page
3. read_page(tabId, filter: "interactive")          → find email, password fields
4. form_input(tabId, ref: emailRef, value: "user@example.com")
5. form_input(tabId, ref: passwordRef, value: "password123")
6. computer(action: "left_click", tabId, ref: signInButtonRef)
7. computer(action: "wait", tabId, duration: 2)     → let the page load
8. computer(action: "screenshot", tabId)             → verify we're signed in
```

### Test a web form with edge cases

```
1. Navigate to the form
2. read_page(filter: "interactive") → map out all fields
3. For each test case:
   a. Fill fields with form_input
   b. Submit the form
   c. screenshot + read_page to check for error messages
   d. navigate(url: "back") or re-navigate to reset
4. Try: empty fields, very long strings, special characters,
   invalid emails, SQL injection strings, XSS payloads in inputs
```

### Scrape structured data from a page

```
1. Navigate to the page
2. get_page_text(tabId) for raw text content
3. Or use javascript_tool to extract specific data:
   javascript_tool(text: `
     Array.from(document.querySelectorAll('.product-card')).map(card => ({
       title: card.querySelector('h2')?.textContent,
       price: card.querySelector('.price')?.textContent
     }))
   `)
```

### Debug a failing web app

```
1. Navigate to the page
2. read_console_messages(tabId, onlyErrors: true) → check for JS errors
3. read_network_requests(tabId, urlPattern: "/api/") → check for failed requests
4. screenshot → see visual state
5. javascript_tool to inspect app state if needed
```


## Tips and Pitfalls

**Connection drops:** The Chrome extension connection can be flaky. If you get
a "not connected" error, wait a few seconds and retry. If it persists, ask the
user to check that Chrome is open and the extension is active.

**Large pages:** `read_page` can return very large outputs. Start with
`filter: "interactive"` or a shallow `depth` and only go deeper if you need to.
If the output is truncated, focus on a specific `ref_id` subtree.

**Coordinate accuracy:** When clicking by coordinates, always take a screenshot
first and aim for the center of the target element. Off-by-a-few-pixels clicks
on element edges can miss. Using `ref` instead of coordinates avoids this
entirely.

**Form filling:** Prefer `form_input` over click-then-type. It's more reliable,
handles dropdowns and checkboxes natively, and doesn't depend on focus state.

**File uploads:** Never click file input buttons — use `file_upload` with a ref.
Clicking opens a native dialog you can't interact with.

**JavaScript results:** In `javascript_tool`, don't use `return`. The last
expression is automatically returned. Write `document.title` not
`return document.title`.

**After navigation:** Pages take time to load. After `navigate`, consider a
brief `wait` (1–2 seconds) or just take a screenshot — the screenshot itself
gives the page a moment to render, and you can see if it's ready.

**Tab hygiene:** Create new tabs for new pages rather than reusing the user's
existing tabs. Close tabs you're done with using `tabs_close_mcp`.


## Troubleshooting

### "Claude in Chrome is not connected"

This is the most common issue. It means the MCP tools exist on your side but
there's no Chrome extension to receive the commands. Work through these checks
in order:

1. **Is the extension installed?** Go to `chrome://extensions` and search for
   "Claude in Chrome". If it's not there, it needs to be installed from the
   Chrome Web Store first. Without the extension, none of the Chrome tools
   will work — period.

2. **Is the extension enabled?** On the extensions page, make sure the toggle
   is ON (blue). If it shows "Paused" or is toggled off, enable it.

3. **Is the extension connected to this session?** Click the extension icon
   in the toolbar. It should show a connected/active state. If there's a
   "Connect" button, click it.

4. **Try toggling the extension.** On `chrome://extensions`, toggle the
   extension off, wait 2 seconds, toggle it back on.

5. **Try restarting Chrome entirely.** Close all Chrome windows and reopen.

If none of this works, it's likely a deeper environment issue (e.g., the MCP
server can't reach the extension's native messaging host). Let the user know
and suggest they check the extension's documentation.

### Connection works intermittently

The WebSocket connection between the MCP server and the extension can drop
temporarily. If a single call fails with "not connected," just retry after
a 2–3 second pause. Don't give up after one failure — try at least 3 times
before escalating to the user.

### `read_page` output is too large

The default output limit is 50,000 characters. For complex pages this isn't
enough. Strategies:

- Use `filter: "interactive"` to see only actionable elements
- Reduce `depth` to 3–5
- Focus on a subtree with `ref_id`
- Use `find` with a natural-language query instead

### Clicks don't seem to land on the right element

- Always screenshot first to see current layout
- Use `zoom` on the target area to verify element positions
- Prefer `ref`-based clicking over coordinates
- Make sure the element is scrolled into view (`scroll_to`)
- Check if there's an overlay, modal, or tooltip covering the target