import { shell, systemPreferences } from 'electron';
import type { PermissionState, PermissionsInfo } from '../shared/types';

export function screenPermission(): PermissionState {
  if (process.platform !== 'darwin') return 'not-required';
  const s = systemPreferences.getMediaAccessStatus('screen');
  return s === 'granted' || s === 'denied' || s === 'restricted' || s === 'not-determined' ? s : 'unknown';
}

export function getPermissions(location: PermissionState): PermissionsInfo {
  return { screen: screenPermission(), location: process.platform === 'linux' ? 'not-required' : location };
}

export async function openPermissionSettings(kind: 'screen' | 'location'): Promise<void> {
  if (process.platform === 'darwin') {
    const pane = kind === 'screen' ? 'Privacy_ScreenCapture' : 'Privacy_LocationServices';
    await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
  } else if (process.platform === 'win32' && kind === 'location') {
    await shell.openExternal('ms-settings:privacy-location');
  }
}
