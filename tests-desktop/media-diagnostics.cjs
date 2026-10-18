// Fixture-only evidence for failures on the native Windows runner. Never reads user files.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { createHash } = require('node:crypto');
exports.inspectFixtureFile = async function(file) {
  const evidence = { platform: process.platform, noFollow: constants.O_NOFOLLOW ?? null };
  let handle;
  try {
    evidence.parentCanonical = await fs.realpath(dirname(file)) === resolve(dirname(file));
    const initial = await fs.lstat(file);
    evidence.initial = { ino: initial.ino, file: initial.isFile(), link: initial.isSymbolicLink(), size: initial.size };
    handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const before = await handle.stat();
    evidence.opened = { ino: before.ino, file: before.isFile(), size: before.size, mtime: before.mtimeMs };
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    evidence.sha256 = hash.digest('hex');
    const after = await handle.stat();
    evidence.after = { size: after.size, mtime: after.mtimeMs };
  } catch (error) { evidence.error = { code: error.code, message: error.message }; }
  finally { await handle?.close().catch(() => undefined); }
  return evidence;
};
