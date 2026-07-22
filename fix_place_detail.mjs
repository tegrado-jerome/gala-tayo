import { readFileSync, writeFileSync } from 'fs';

const path = new URL('.', import.meta.url).pathname.replace(/\/$/, '') + '/frontend/src/components/PlaceDetailView.tsx';
let c = readFileSync(path, 'utf8');

// 1. Replace first lucide import
c = c.replace(
  "import { Check, Flag, ImagePlus, MessageCircle, MoreHorizontal, Pencil, Reply, Trash2, Wallet, X } from 'lucide-react'",
  "import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'\nimport { faCamera, faCheck, faComment, faEllipsis, faFlag, faPen, faReply, faTrash, faWallet, faXmark } from '@fortawesome/free-solid-svg-icons'"
);

// 2. Replace second lucide import
c = c.replace(
  "import { House, LayoutGrid, MapPin, Search } from 'lucide-react'",
  "import { faHouse, faLocationDot, faMagnifyingGlass, faTableCellsLarge } from '@fortawesome/free-solid-svg-icons'"
);

// 3. Replace icon usages
c = c.replace(/<Wallet className="h-3\.5 w-3\.5" \/>/g, '<FontAwesomeIcon icon={faWallet} className="h-3.5 w-3.5" />');
c = c.replace(/<ImagePlus className="h-4 w-4" strokeWidth=\{2\.2\} \/>/g, '<FontAwesomeIcon icon={faCamera} className="h-4 w-4" />');
c = c.replace(/<ImagePlus className="h-4 w-4" strokeWidth=\{2\.2\} \/>\s*Add photo/g, '<FontAwesomeIcon icon={faCamera} className="h-4 w-4" />\n                        Add photo');
c = c.replace(/<ImagePlus className="h-5 w-5" strokeWidth=\{2\.2\} \/>/g, '<FontAwesomeIcon icon={faCamera} className="h-5 w-5" />');
c = c.replace(/<MoreHorizontal className="h-4 w-4" strokeWidth=\{2\.2\} \/>/g, '<FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" />');
c = c.replace(/<Pencil className="h-3\.5 w-3\.5" strokeWidth=\{2\.2\} \/>/g, '<FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />');
c = c.replace(/<Trash2 className="h-3\.5 w-3\.5" strokeWidth=\{2\.2\} \/>/g, '<FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />');
c = c.replace(/<Flag className="h-3\.5 w-3\.5" strokeWidth=\{2\.2\} \/>/g, '<FontAwesomeIcon icon={faFlag} className="h-3.5 w-3.5" />');
c = c.replace(/<Reply className="h-3\.5 w-3\.5" strokeWidth=\{2\.2\} \/>/g, '<FontAwesomeIcon icon={faReply} className="h-3.5 w-3.5" />');
c = c.replace(/<MessageCircle className="h-4 w-4" strokeWidth=\{2\.2\} \/>/g, '<FontAwesomeIcon icon={faComment} className="h-4 w-4" />');
c = c.replace(/<MessageCircle className="h-5 w-5" strokeWidth=\{2\.2\} \/>/g, '<FontAwesomeIcon icon={faComment} className="h-5 w-5" />');
c = c.replace(/<X className="h-4 w-4" strokeWidth=\{2\.4\} \/>/g, '<FontAwesomeIcon icon={faXmark} className="h-4 w-4" />');
c = c.replace(/<Check className="h-4 w-4" strokeWidth=\{2\.4\} \/>/g, '<FontAwesomeIcon icon={faCheck} className="h-4 w-4" />');
c = c.replace(/<LayoutGrid className="h-3\.5 w-3\.5" \/>/g, '<FontAwesomeIcon icon={faTableCellsLarge} className="h-3.5 w-3.5" />');
c = c.replace(/<Search className="h-3\.5 w-3\.5" \/>/g, '<FontAwesomeIcon icon={faMagnifyingGlass} className="h-3.5 w-3.5" />');
c = c.replace(/<House className="h-3\.5 w-3\.5" \/>/g, '<FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" />');
c = c.replace(/<MapPin className="h-3\.5 w-3\.5" \/>/g, '<FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" />');

// 4. Fix all remaining ImagePlus occurrences
c = c.replace(/ImagePlus/g, 'CameraPlus_no_import');

// 5. Replace dot/peso sign with unicode escape
// Line 118: Starting from with dot
c = c.replace(
  'return `Starting from \u20b1${new Intl.NumberFormat(\'en-US\').format(Math.max(0, Math.floor(parsedBudgetMin)))}`',
  'return `Starting from \\u00b7${new Intl.NumberFormat(\'en-US\').format(Math.max(0, Math.floor(parsedBudgetMin)))}`'
);
// Line 126: Starting from with dot
c = c.replace(
  'return `Starting from \u20b1${new Intl.NumberFormat(\'en-US\').format(Math.max(0, Math.floor(parsedAmount)))}`',
  'return `Starting from \\u00b7${new Intl.NumberFormat(\'en-US\').format(Math.max(0, Math.floor(parsedAmount)))}`'
);
// Line 971: From with dot
c = c.replace(
  "parts.push(`From \u20b1${Number(place.budget_min).toLocaleString()}`)",
  "parts.push(`From \\u00b7${Number(place.budget_min).toLocaleString()}`)"
);

// 6. Fix regex on line 123
c = c.replace(
  /\(\?:\u20b1\|PHP/g,
  '(?:\\\\u00b7|PHP'
);

writeFileSync(path, c, 'utf8');
console.log('Done - UTF-8 safe');
