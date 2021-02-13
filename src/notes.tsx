import { h, render, Fragment } from "preact"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useState, useEffect, useRef } from "preact/hooks";

import {
  Notification,
  RegularFont,
  GoogleFont,
  Theme,
  NotesObject,
  Sync,
  Message,
  MessageType,
  ContextMenuSelection,
} from "shared/storage/schema";
import setThemeCore from "themes/set-theme";

import __Notification from "notes/components/Notification";
import __Sidebar from "notes/components/Sidebar";
import __Content from "notes/components/Content";
import __Toolbar from "notes/components/Toolbar";

import __ContextMenu, { ContextMenuProps } from "notes/components/ContextMenu";
import __RenameNoteModal, { RenameNoteModalProps } from "notes/components/modals/RenameNoteModal";
import __DeleteNoteModal, { DeleteNoteModalProps } from "notes/components/modals/DeleteNoteModal";
import __NewNoteModal, { NewNoteModalProps } from "notes/components/modals/NewNoteModal";
import __Overlay from "notes/components/Overlay";

import renameNote from "notes/state/rename-note";
import deleteNote from "notes/state/delete-note";
import createNote from "notes/state/create-note";

import edit from "notes/content/edit";
import { saveNotes } from "notes/content/save";
import { syncNotes } from "notes/content/sync";
import notesHistory from "notes/history";
import hotkeys, { Hotkey } from "notes/hotkeys";
import { sendMessage } from "messages";

const Notes = () => {
  const [os, setOs] = useState<"mac" | "other" | undefined>(undefined);
  const [tabId, setTabId] = useState<string>("");
  const tabIdRef = useRef<string>();
  tabIdRef.current = tabId;

  const [notification, setNotification] = useState<Notification | undefined>(undefined);
  const [font, setFont] = useState<RegularFont | GoogleFont | undefined>(undefined);
  const [size, setSize] = useState<number>(0);
  const [sidebar, setSidebar] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<string | undefined>(undefined);
  const [toolbar, setToolbar] = useState<boolean>(false);
  const [theme, setTheme] = useState<Theme | undefined>(undefined);
  const [customTheme, setCustomTheme] = useState<string>("");

  const [notesProps, setNotesProps] = useState<{
    notes: NotesObject,
    active: string,
    clipboard: string,
  }>({
    notes: {},
    active: "",
    clipboard: "",
  });
  const notesRef = useRef<NotesObject>();
  notesRef.current = notesProps.notes;

  const [initialContent, setInitialContent] = useState<string>("");
  const [focus, setFocus] = useState<boolean>(false);
  const [tab, setTab] = useState<boolean>(false);
  const [sync, setSync] = useState<Sync | undefined>(undefined);
  const syncRef = useRef<Sync | undefined>(undefined);
  syncRef.current = sync;

  const [contextMenuProps, setContextMenuProps] = useState<ContextMenuProps | null>(null);
  const [renameNoteModalProps, setRenameNoteModalProps] = useState<RenameNoteModalProps | null>(null);
  const [deleteNoteModalProps, setDeleteNoteModalProps] = useState<DeleteNoteModalProps | null>(null);
  const [newNoteModalProps, setNewNoteModalProps] = useState<NewNoteModalProps | null>(null);

  useEffect(() => {
    chrome.storage.local.get([
      // Notifications
      "notification",

      // Appearance
      "font",
      "size",
      "sidebar",
      "sidebarWidth",
      "toolbar",
      "theme",
      "customTheme",

      // Notes
      "notes",
      "active",
      "clipboard",

      // Options
      "focus",
      "tab",

      // Sync
      "sync"
    ], local => {
      // Notifications
      setNotification(local.notification);

      // Appearance
      setFont(local.font);
      setSize(local.size);
      setSidebar(local.sidebar);
      setSidebarWidth(local.sidebarWidth);
      setToolbar(local.toolbar);
      setTheme(local.theme);
      setCustomTheme(local.customTheme);

      // Notes
      const activeFromUrl: string = window.location.search.startsWith("?") ? decodeURIComponent(window.location.search.substring(1)) : ""; // Bookmark
      const firstAvailableNote: string = Object.keys(local.notes as NotesObject).sort().shift() || "";
      const activeCandidates: string[] = [activeFromUrl, local.active as string, firstAvailableNote]; // ordered by importance
      const active: string = activeCandidates.find((candidate) => candidate && candidate in local.notes) || "";
      setNotesProps({
        notes: local.notes,
        active,
        clipboard: local.clipboard,
      });

      // Options
      setFocus(local.focus);
      setTab(local.tab);

      // Sync
      setSync(local.sync);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local") {
        if (changes["font"]) {
          setFont(changes["font"].newValue);
        }

        if (changes["size"]) {
          setSize(changes["size"].newValue);
        }

        if (changes["theme"]) {
          setTheme(changes["theme"].newValue);
        }

        if (changes["customTheme"]) {
          setCustomTheme(changes["customTheme"].newValue);
        }

        if (changes["notes"]) {
          const oldNotes: NotesObject = changes["notes"].oldValue;
          const newNotes: NotesObject = changes["notes"].newValue;

          const oldSet = new Set(Object.keys(oldNotes));
          const newSet = new Set(Object.keys(newNotes));

          const clipboardCandidate: string | null | undefined = changes["clipboard"] ? changes["clipboard"].newValue : undefined;

          // RENAME
          if (newSet.size === oldSet.size) {
            const diff = new Set([...newSet].filter(x => !oldSet.has(x)));
            if (diff.size === 1) {
              const renamedNoteName = diff.values().next().value;
              setNotesProps((prev) => {
                const newActive = prev.active in newNotes
                  ? prev.active // active is NOT renamed => keep unchanged
                  : renamedNoteName; // active is renamed => update it

                if (newActive !== prev.active) {
                  notesHistory.replace(newActive); // active is renamed => replace history
                }

                const newClipboard = clipboardCandidate === undefined
                  ? prev.clipboard // clipboard is NOT renamed => keep unchanged
                  : (clipboardCandidate || ""); // clipboard is renamed => update it

                return {
                  notes: newNotes,
                  active: newActive,
                  clipboard: newClipboard,
                };
              });

              return; // RENAME condition was met
            }
          }

          // DELETE
          if (oldSet.size > newSet.size) {
            const firstAvailableNote = Object.keys(newNotes).sort()[0] || "";
            setNotesProps((prev) => {
              const newActive = prev.active in newNotes
                ? prev.active // active is NOT deleted => keep unchanged
                : firstAvailableNote; // active is deleted => use first available

              if (newActive !== prev.active) {
                notesHistory.replace(newActive); // active is deleted => replace history
              }

              const newClipboard = clipboardCandidate === undefined
                ? prev.clipboard // clipboard is NOT deleted => keep unchanged
                : (clipboardCandidate || ""); // clipboard is deleted => update it

              return {
                notes: newNotes,
                active: newActive,
                clipboard: newClipboard,
              };
            });

            return; // DELETE condition was met
          }

          // NEW or UPDATE
          setNotesProps((prev) => {
            // Auto-active new note
            const newActive = (changes["active"] && changes["active"].newValue) || prev.active;

            // Update clipboard (automatically created when needed)
            const newClipboard = clipboardCandidate === undefined
              ? prev.clipboard // created note is NOT Clipboard
              : (clipboardCandidate || ""); // created note is Clipboard

            // Re-activate note updated from background (Clipboard) or from other tab (any note)
            if (
              (newActive in oldNotes) &&
              (newActive in newNotes) &&
              (newNotes[newActive].content !== oldNotes[newActive].content) &&
              (localStorage.getItem("notesChangedBy") !== tabIdRef.current)
            ) {
              setInitialContent(newNotes[newActive].content);
            }

            return {
              notes: newNotes,
              active: newActive,
              clipboard: newClipboard,
            };
          });
        }

        if (changes["clipboard"]) {
          setNotesProps((prev) => ({
            ...prev,
            clipboard: changes["clipboard"].newValue,
          }));
        }

        if (changes["focus"]) {
          setFocus(changes["focus"].newValue);
        }

        if (changes["tab"]) {
          setTab(changes["tab"].newValue);
        }

        if (changes["sync"]) {
          setSync(changes["sync"].newValue);
          document.body.classList.remove("syncing");
        }
      }

      if (areaName === "sync") {
        if (changes["selection"]) {
          const selection = changes["selection"].newValue as ContextMenuSelection;
          if (!selection || !selection.text) { return; }
          chrome.storage.local.get(["id"], local => {
            if (selection.sender === local.id) { return; }
            sendMessage(MessageType.SAVE_TO_CLIPBOARD, selection.text);
          });
        }
      }
    });

    chrome.runtime.onMessage.addListener((message: Message) => {
      if (message.type === MessageType.SYNC_DONE || message.type === MessageType.SYNC_FAIL) {
        document.body.classList.remove("syncing");
      }
    });

    chrome.runtime.getPlatformInfo((platformInfo) => setOs(platformInfo.os === "mac" ? "mac" : "other"));
    chrome.tabs.getCurrent((tab) => tab && setTabId(String(tab.id)));

    notesHistory.attach((noteName) => {
      setNotesProps((prev) => noteName in prev.notes
        ? { ...prev, active: noteName }
        : prev);
    });

    window.addEventListener("beforeunload", () => {
      saveNotes(notesRef.current);
    });
  }, []);

  // Font
  useEffect(() => {
    if (!font) {
      return;
    }

    const href = (font as GoogleFont).href;
    if (href) {
      (document.getElementById("google-fonts") as HTMLLinkElement).href = href;
    }

    document.body.style.fontFamily = font.fontFamily;
  }, [font]);

  // Size
  useEffect(() => {
    document.body.style.fontSize = Number.isInteger(size) ? `${size}%` : "";
  }, [size]);

  // Sidebar
  useEffect(() => {
    document.body.classList.toggle("with-sidebar", sidebar);
  }, [sidebar]);

  // Sidebar width
  useEffect(() => {
    document.body.style.left = sidebarWidth ?? "";
  }, [sidebarWidth]);

  // Theme
  useEffect(() => {
    // setThemeCore injects one of:
    // - light.css
    // - dark.css
    // - customTheme string
    theme && setThemeCore({ name: theme, customTheme: customTheme });
  }, [theme, customTheme]);

  // Focus
  useEffect(() => {
    document.body.classList.toggle("focus", focus);
  }, [focus]);

  // Hide context menu on click anywhere
  useEffect(() => {
    document.addEventListener("click", () => setContextMenuProps(null));
  }, []);

  // Activate note
  useEffect(() => {
    const note = notesProps.notes[notesProps.active];
    setInitialContent(note ? note.content : "");
    document.title = note ? notesProps.active : "My Notes";
  }, [notesProps.active]);

  // Modal
  useEffect(() => {
    document.body.classList.toggle("with-modal", Boolean(renameNoteModalProps || deleteNoteModalProps || newNoteModalProps));
  }, [renameNoteModalProps || deleteNoteModalProps || newNoteModalProps]);

  // Toolbar
  useEffect(() => {
    document.body.classList.toggle("with-toolbar", toolbar);
  }, [toolbar]);

  // Hotkeys
  useEffect(() => {
    if (!os) {
      return;
    }

    hotkeys.register(os);
    hotkeys.subscribe(Hotkey.OnEscape, () => setContextMenuProps(null));
    hotkeys.subscribe(Hotkey.OnOpenOptions, () => chrome.tabs.create({ url: "/options.html" }));
    hotkeys.subscribe(Hotkey.OnToggleFocusMode, () => {
      chrome.storage.local.get(["focus"], local => {
        chrome.storage.local.set({ focus: !local.focus });
      });
    });
    hotkeys.subscribe(Hotkey.OnToggleSidebar, () => {
      chrome.storage.local.get(["focus"], local => {
        if (!local.focus) { // toggle only if not in focus mode
          const hasSidebar = document.body.classList.toggle("with-sidebar");
          chrome.storage.local.set({ sidebar: hasSidebar });
        }
      });
    });
    hotkeys.subscribe(Hotkey.OnToggleToolbar, () => {
      chrome.storage.local.get(["focus"], local => {
        if (!local.focus) { // toggle only if not in focus mode
          const hasToolbar = document.body.classList.toggle("with-toolbar");
          chrome.storage.local.set({ toolbar: hasToolbar });
        }
      });
    });
    hotkeys.subscribe(Hotkey.OnSync, () => syncNotes(syncRef.current));
  }, [os]);

  useEffect(() => {
    window.addEventListener("blur", () => {
      document.body.classList.remove("with-control");
    });
  }, []);

  return (
    <Fragment>
      {notification && (
        <__Notification
          notification={notification}
          onClose={() => {
            setNotification(undefined);
            chrome.storage.local.remove("notification");
          }}
        />
      )}

      <__Sidebar
        os={os}
        {...notesProps}
        width={sidebarWidth}
        onActivateNote={(noteName) => {
          setNotesProps((prev) => ({ ...prev, active: noteName }));
          notesHistory.push(noteName);
          chrome.storage.local.set({ active: noteName });
        }}
        onNoteContextMenu={(noteName, x, y) => setContextMenuProps({
          noteName, x, y,
          onUseAsClipboard: (noteName) => chrome.storage.local.set({ clipboard: noteName }),
          onRename: (noteName) => setRenameNoteModalProps({
            noteName,
            validate: (newNoteName: string) => newNoteName.length > 0 && newNoteName !== noteName && !(newNoteName in notesProps.notes),
            onCancel: () => setRenameNoteModalProps(null),
            onConfirm: (newNoteName) => {
              setRenameNoteModalProps(null);
              renameNote(noteName, newNoteName);
            },
          }),
          onDelete: (noteName) => setDeleteNoteModalProps({
            noteName,
            onCancel: () => setDeleteNoteModalProps(null),
            onConfirm: () => {
              setDeleteNoteModalProps(null);
              deleteNote(noteName);
            },
          }),
        })}
        onNewNote={() => setNewNoteModalProps({
          validate: (newNoteName: string) => newNoteName.length > 0 && !(newNoteName in notesProps.notes),
          onCancel: () => setNewNoteModalProps(null),
          onConfirm: (newNoteName) => {
            setNewNoteModalProps(null);
            createNote(newNoteName);
          },
        })}
        sync={sync}
      />

      <__Content
        active={notesProps.active}
        initialContent={initialContent}
        onEdit={(active, content) => {
          edit(active, content, tabId, notesProps.notes);
        }}
        indentOnTab={tab}
      />

      <__Toolbar
        os={os}
      />

      {contextMenuProps && (
        <__ContextMenu {...contextMenuProps} />
      )}

      {renameNoteModalProps && (
        <Fragment>
          <__RenameNoteModal {...renameNoteModalProps} />
          <__Overlay type="to-rename" />
        </Fragment>
      )}

      {deleteNoteModalProps && (
        <Fragment>
          <__DeleteNoteModal {...deleteNoteModalProps} />
          <__Overlay type="to-delete" />
        </Fragment>
      )}

      {newNoteModalProps && (
        <Fragment>
          <__NewNoteModal {...newNoteModalProps} />
          <__Overlay type="to-create" />
        </Fragment>
      )}
    </Fragment>
  );
};

render(<Notes />, document.body);
