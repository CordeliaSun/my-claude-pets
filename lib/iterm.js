// The project path and command travel as argv items so they are never
// interpolated into the AppleScript source (no quoting/injection issues).
const WINDOW_SCRIPT = `
on run argv
  tell application "iTerm"
    set newWindow to (create window with default profile)
    tell current session of newWindow
      write text "cd " & quoted form of (item 1 of argv) & " && " & (item 2 of argv)
    end tell
    activate
  end tell
end run
`.trim()

// Open as a tab in the current iTerm window; fall back to a new window
// when iTerm is running without any open windows.
const TAB_SCRIPT = `
on run argv
  tell application "iTerm"
    if (count of windows) = 0 then
      create window with default profile
    else
      tell current window to create tab with default profile
    end if
    tell current session of current window
      write text "cd " & quoted form of (item 1 of argv) & " && " & (item 2 of argv)
    end tell
    activate
  end tell
end run
`.trim()

function buildOsascriptArgs(projectPath, command, mode = 'window') {
  const script = mode === 'tab' ? TAB_SCRIPT : WINDOW_SCRIPT
  return ['-e', script, projectPath, command]
}

module.exports = { buildOsascriptArgs }
