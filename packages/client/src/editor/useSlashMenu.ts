/**
 * The canvas's slash menu: what it shows and which item is picked, behind the bridge the
 * slash-command extension talks to (keys, open, update, close).
 */
import { useMemo, useRef, useState } from "react";
import type { SlashItem, SlashMenuBridge, SlashMenuState } from "./extensions/slashCommand.js";

export function useSlashMenu() {
  const bridgeRef = useRef<SlashMenuBridge | null>(null);
  const [menu, setMenu] = useState<SlashMenuState | null>(null);
  const [selected, setSelected] = useState(0);

  const menuRef = useRef<{ state: SlashMenuState | null; selected: number; dismissed: boolean }>({ state: null, selected: 0, dismissed: false });
  const pickRef = useRef<(item: SlashItem) => void>(() => undefined);
  const bridge = useMemo<SlashMenuBridge>(() => {
    const r = menuRef.current;
    const pick = (item: SlashItem) => {
      const s = r.state;
      r.state = null;
      setMenu(null);
      s?.command(item);
    };
    pickRef.current = pick;
    return {
      open(s) {
        r.dismissed = false;
        r.state = s;
        r.selected = 0;
        setMenu(s);
        setSelected(0);
      },
      update(s) {
        if (r.dismissed) return;
        r.state = s;
        r.selected = Math.min(r.selected, Math.max(0, s.items.length - 1));
        setMenu(s);
        setSelected(r.selected);
      },
      close() {
        r.state = null;
        setMenu(null);
      },
      keyDown(e) {
        const s = r.state;
        if (!s || r.dismissed) return false;
        if (e.key === "Escape") {
          r.dismissed = true;
          this.close();
          return true;
        }
        if (s.items.length === 0) return false;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const n = s.items.length;
          r.selected = (r.selected + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
          setSelected(r.selected);
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          pick(s.items[r.selected]!);
          return true;
        }
        return false;
      },
    };
  }, []);
  bridgeRef.current = bridge;

  return { bridgeRef, pickRef, menu, selected, setSelected };
}
