export default function renameNote(oldName: string, newName: string): void {
  if (!oldName || !newName || (oldName === newName)) {
    console.debug(`RENAME - Fail ("${oldName}" => "${newName}")`);
    return;
  }

  chrome.storage.local.get(["notes", "clipboard"], local => {
    const notes = { ...local.notes };

    // newName must be available
    if (newName in notes) {
      console.debug(`RENAME - Fail ("${newName}" not available)`);
      return;
    }

    // oldName must be present
    if (!(oldName in notes)) {
      console.debug(`RENAME - Fail ("${oldName}" doesn't exist)`);
      return;
    }

    // Backup old note
    const note = notes[oldName];
    delete notes[oldName];

    // Create a note under the new name
    notes[newName] = {
      ...note,
      modifiedTime: new Date().toISOString(),
    };

    // New clipboard
    const clipboard = local.clipboard === oldName ? newName : local.clipboard;

    chrome.storage.local.set({ notes, clipboard }, () => {
      console.debug(`RENAME - OK ("${oldName}" => "${newName}")`);
    });
  });
}
