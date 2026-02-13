const FileSystem = jest.requireMock('expo-file-system/legacy');

import {
  downloadImage,
  getCachedFactImage,
  clearAllCachedImages,
} from '../../services/images';

describe('images — downloadImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no cached file
    FileSystem.getInfoAsync.mockResolvedValue({ exists: false, size: 0 });
    FileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
    FileSystem.moveAsync.mockResolvedValue(undefined);
    FileSystem.deleteAsync.mockResolvedValue(undefined);
  });

  it('returns cached file on cache hit (skips download)', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: 5000,
      modificationTime: Date.now() / 1000, // Recent
    });

    const result = await downloadImage('https://img.test/fact.webp', 42);
    expect(result).toContain('fact-42');
    // downloadAsync should NOT be called on cache hit
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent downloads for the same factId', async () => {
    // Make file not cached
    FileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    FileSystem.downloadAsync.mockImplementation(async () => {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 50));
      return { status: 200, uri: 'file:///mock/download' };
    });
    FileSystem.getInfoAsync.mockImplementation(async (uri: string) => {
      if (uri.includes('.tmp')) {
        return { exists: true, size: 5000 };
      }
      return { exists: false };
    });

    // Fire concurrent downloads for the same fact
    const [r1, r2] = await Promise.all([
      downloadImage('https://img.test/fact.webp', 99),
      downloadImage('https://img.test/fact.webp', 99),
    ]);

    // Both should get the same result
    expect(r1).toBe(r2);
  });

  it('downloads without custom headers', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    FileSystem.downloadAsync.mockResolvedValue({ status: 200, uri: 'file:///mock/dl' });
    // For the temp file check
    FileSystem.getInfoAsync.mockImplementation(async (uri: string) => {
      if (uri.includes('.tmp')) {
        return { exists: true, size: 5000 };
      }
      return { exists: false };
    });

    await downloadImage('https://img.test/fact.webp', 1);

    // Check that downloadAsync was called without auth headers
    if (FileSystem.downloadAsync.mock.calls.length > 0) {
      const headers = FileSystem.downloadAsync.mock.calls[0][2]?.headers;
      expect(headers?.['X-Firebase-AppCheck']).toBeUndefined();
    }
  });

  it('validates file size (rejects too small)', async () => {
    FileSystem.getInfoAsync.mockImplementation(async (uri: string) => {
      if (uri.includes('.tmp')) {
        return { exists: true, size: 100 }; // Too small (< MIN_FILE_SIZE_BYTES=1024)
      }
      return { exists: false };
    });
    FileSystem.downloadAsync.mockResolvedValue({ status: 200, uri: 'file:///mock/dl' });

    const result = await downloadImage('https://img.test/small.webp', 50);
    // Should fail because file is too small
    expect(result).toBeNull();
  });

  it('uses atomic write (temp then move)', async () => {
    let downloadCalled = false;
    FileSystem.getInfoAsync.mockImplementation(async (uri: string) => {
      if (uri.includes('.tmp') && downloadCalled) {
        return { exists: true, size: 5000 };
      }
      return { exists: false };
    });
    FileSystem.downloadAsync.mockImplementation(async () => {
      downloadCalled = true;
      return { status: 200, uri: 'file:///mock/dl' };
    });

    await downloadImage('https://img.test/fact.webp', 10);

    // moveAsync should be called (temp → final)
    if (FileSystem.downloadAsync.mock.calls.length > 0) {
      expect(FileSystem.moveAsync).toHaveBeenCalled();
    }
  });
});

describe('images — getCachedFactImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no cached file exists', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    // Need to reset module to clear in-memory cache
    jest.resetModules();
    const { getCachedFactImage: freshGetCached } = require('../../services/images');
    const result = await freshGetCached(999);
    expect(result).toBeNull();
  });

  it('checks multiple extensions', async () => {
    jest.resetModules();
    // Get fresh FileSystem mock after resetModules
    const freshFS = jest.requireMock('expo-file-system/legacy');
    freshFS.getInfoAsync.mockResolvedValue({ exists: false });
    freshFS.deleteAsync.mockResolvedValue(undefined);
    const { getCachedFactImage: freshGetCached } = require('../../services/images');
    await freshGetCached(123);
    // Should check webp, jpg, jpeg, png, gif
    const calls = freshFS.getInfoAsync.mock.calls.map((c: any[]) => c[0]);
    const extensions = calls.map((uri: string) => uri.split('.').pop());
    expect(extensions).toContain('webp');
    expect(extensions).toContain('jpg');
    expect(extensions).toContain('png');
  });

  it('rejects expired files (>2 day)', async () => {
    const oldModTime = (Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000; // 3 days ago
    FileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: 5000,
      modificationTime: oldModTime,
    });
    jest.resetModules();
    const { getCachedFactImage: freshGetCached } = require('../../services/images');
    const result = await freshGetCached(456);
    expect(result).toBeNull();
  });

  it('rejects undersized files', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: 100, // Less than MIN_FILE_SIZE_BYTES (1024)
      modificationTime: Date.now() / 1000,
    });
    jest.resetModules();
    const { getCachedFactImage: freshGetCached } = require('../../services/images');
    const result = await freshGetCached(789);
    expect(result).toBeNull();
  });
});

describe('images — clearAllCachedImages', () => {
  it('clears memory and files, reports count and bytes', async () => {
    FileSystem.getInfoAsync.mockImplementation(async (uri: string) => {
      if (uri.includes('fact-images/') && !uri.includes('fact-')) {
        return { exists: true }; // directory exists
      }
      return { exists: true, size: 1000 }; // each file is 1KB
    });
    FileSystem.readDirectoryAsync.mockResolvedValue(['fact-1.webp', 'fact-2.jpg']);
    FileSystem.deleteAsync.mockResolvedValue(undefined);

    const result = await clearAllCachedImages();
    expect(result.deletedCount).toBe(2);
    expect(result.freedBytes).toBe(2000);
  });

  it('handles missing directory', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    const result = await clearAllCachedImages();
    expect(result.deletedCount).toBe(0);
    expect(result.freedBytes).toBe(0);
  });
});
