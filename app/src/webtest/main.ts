import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { handle } from './fake-core';

mockWindows('main');
mockIPC((cmd, args) => handle(cmd, (args ?? {}) as Record<string, unknown>), { shouldMockEvents: true });
void import('../main'); // not top-level await: Vite's default target rejects it; mockIPC is already installed
