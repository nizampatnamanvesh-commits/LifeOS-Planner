type StorageWriter = Pick<Storage, 'setItem'>;

export function persistAppState(
  key: string,
  state: unknown,
  getStorage: () => StorageWriter = () => window.localStorage,
): boolean {
  try {
    getStorage().setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
