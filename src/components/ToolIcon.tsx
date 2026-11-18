import {
  ArrowUpDown,
  ClipboardList,
  Crop,
  Diff,
  Eraser,
  EyeOff,
  FileArchive,
  FileImage,
  FileOutput,
  FilePen,
  FileSearch,
  FileText,
  FileType2,
  Frame,
  Hash,
  Images,
  LockKeyhole,
  Merge,
  RefreshCw,
  Replace,
  RotateCw,
  ScanSearch,
  ScanText,
  Scissors,
  Shrink,
  Signature,
  Stamp,
  TextCursorInput,
  Trash2,
  type LucideIcon,
} from "lucide-react";

// An explicit map instead of `import * as Icons`: a namespace import defeats
// tree-shaking and ships the whole icon library to the home page. Keys are
// the `icon` strings in lib/tools.ts. Icons are picked per tool for what the
// glyph depicts (scissors for split, trash for delete), not for the set's look.
const ICONS: Record<string, LucideIcon> = {
  ArrowUpDown,
  ClipboardList,
  Crop,
  Diff,
  Eraser,
  EyeOff,
  FileArchive,
  FileImage,
  FileOutput,
  FilePen,
  FileSearch,
  FileText,
  FileType2,
  Frame,
  Hash,
  Images,
  LockKeyhole,
  Merge,
  RefreshCw,
  Replace,
  RotateCw,
  ScanSearch,
  ScanText,
  Scissors,
  Shrink,
  Signature,
  Stamp,
  TextCursorInput,
  Trash2,
};

export function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return <Icon aria-hidden="true" className={className} />;
}
