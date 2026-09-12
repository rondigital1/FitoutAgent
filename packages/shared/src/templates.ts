import type { ChecklistItem, Suggestion } from './index';

export const OFFICE_TEMPLATE: ChecklistItem[] = [
  { id: 'desk', label: 'Oak work desk', query: 'office desk', quantity: 2, must: true },
  { id: 'chair', label: 'Task chair', query: 'office chair', quantity: 2, must: true },
  { id: 'lamp', label: 'Adjustable lamp', query: 'desk lamp', quantity: 2, must: true },
  { id: 'power-strip', label: 'Surge power strip', query: 'surge protector power strip', quantity: 2, must: true },
  { id: 'storage', label: 'Storage organizer', query: 'desk storage organizer', quantity: 1, must: false },
];

export const CAMPING_TEMPLATE: ChecklistItem[] = [
  { id: 'tent', label: '4-person tent', query: '4 person camping tent', quantity: 1, must: true },
  { id: 'sleeping-bag', label: 'Sleeping bag', query: 'sleeping bag', quantity: 4, must: true },
  { id: 'cooler', label: 'Cooler', query: 'camping cooler', quantity: 1, must: true },
  { id: 'lantern', label: 'Lantern', query: 'camping lantern', quantity: 2, must: true },
  { id: 'first-aid', label: 'First aid kit', query: 'first aid kit', quantity: 1, must: true },
];

/** Non-standard add-ons — user opts in via Add (max 5). */
export const OFFICE_SUGGESTIONS: Suggestion[] = [
  { id: 'sug-monitor-arm', label: 'Monitor arm', query: 'desk monitor arm mount', reason: 'Frees desk space for two stations', defaultQty: 2 },
  { id: 'sug-cable-sleeve', label: 'Cable sleeve', query: 'desk cable management sleeve', reason: 'Keeps dual setups tidy', defaultQty: 2 },
  { id: 'sug-footrest', label: 'Footrest', query: 'under desk footrest', reason: 'Comfort for long work sessions', defaultQty: 2 },
  { id: 'sug-webcam', label: '1080p webcam', query: '1080p usb webcam', reason: 'Better calls than a laptop camera', defaultQty: 1 },
  { id: 'sug-whiteboard', label: 'Desk whiteboard', query: 'desktop whiteboard easel', reason: 'Scratchpad without paper clutter', defaultQty: 1 },
];

export const CAMPING_SUGGESTIONS: Suggestion[] = [
  { id: 'sug-camp-chairs', label: 'Camp chairs', query: 'folding camping chair', reason: 'Seating beyond sleeping gear', defaultQty: 4 },
  { id: 'sug-tarp', label: 'Ground tarp', query: 'camping tent footprint tarp', reason: 'Protects tent floor', defaultQty: 1 },
  { id: 'sug-water-jug', label: 'Water jug', query: 'camping water jug 5 gallon', reason: 'Shared water for the group', defaultQty: 1 },
  { id: 'sug-camp-stove', label: 'Camp stove', query: 'portable camping stove', reason: 'Hot meals beyond cooler food', defaultQty: 1 },
  { id: 'sug-sleeping-pad', label: 'Sleeping pad', query: 'camping sleeping pad', reason: 'Insulation under sleeping bags', defaultQty: 4 },
];

export const templates = { office: OFFICE_TEMPLATE, camping: CAMPING_TEMPLATE } as const;
