import type { Settings, StampOptions } from './types';

export const DEFAULT_TIME_FORMAT = "YYYY-MM-DDTHH:mm:ssZ";

export const DEFAULT_STAMP: StampOptions = {
  mode: 'banner',
  position: 'bottom',
  fields: {
    evidenceId: true,
    timestamp: true,
    localClock: true,
    location: true,
    system: true,
    note: true,
    rawHash: true
  },
  theme: 'dark',
  fontSize: 14,
  opacity: 0.75,
  note: '',
  showLocalTime: false,
  timeFormat: DEFAULT_TIME_FORMAT,
  timeZone: 'utc'
};

export const DEFAULT_SETTINGS: Settings = {
  ntpHost: 'time.nist.gov',
  timeFormat: DEFAULT_TIME_FORMAT,
  timeZone: 'utc',
  includeLocation: false,
  reverseGeocode: false,
  allScreensStitched: true,
  saveDirectory: '',
  shortcuts: {
    window: 'CommandOrControl+Shift+1',
    screen: 'CommandOrControl+Shift+2',
    all: 'CommandOrControl+Shift+3',
    region: 'CommandOrControl+Shift+4'
  },
  stamp: DEFAULT_STAMP
};
