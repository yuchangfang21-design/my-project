// Test-only permissions on disposable migration fixtures; never loaded by the application.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function scopedDirectory(root, directory) {
  const temp = fs.realpathSync(os.tmpdir());
  const actualRoot = fs.realpathSync(root);
  const actual = fs.realpathSync(directory);
  const inside = (parent, child) => {
    const relative = path.relative(parent, child);
    return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  };
  if (!/^xumu-(pub|comments)-backup-/.test(path.basename(actualRoot)) || !inside(temp, actualRoot) || !inside(actualRoot, actual) || fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(actual).isDirectory()) {
    throw new Error('Permission fixture must be a child of its disposable migration test directory');
  }
  return actual;
}
function powershell(directory, command, extra = {}) {
  const executable = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return execFileSync(executable, ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop';Import-Module Microsoft.PowerShell.Security -ErrorAction Stop;$target=$env:XUMU_TEST_ACL_DIRECTORY;" + command], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...process.env, XUMU_TEST_ACL_DIRECTORY: directory, ...extra },
  }).trim();
}
function windowsRestore(directory, descriptor) {
  powershell(directory, "$acl=Get-Acl -LiteralPath $target;$acl.SetSecurityDescriptorSddlForm($env:XUMU_TEST_ACL_DESCRIPTOR,[System.Security.AccessControl.AccessControlSections]::Access);Set-Acl -LiteralPath $target -AclObject $acl", { XUMU_TEST_ACL_DESCRIPTOR: descriptor });
}
function withBackupWritesDenied(root, directory, work) {
  const actual = scopedDirectory(root, directory);
  let restore;
  if (process.platform === 'win32') {
    const descriptor = powershell(actual, '(Get-Acl -LiteralPath $target).GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access)');
    restore = () => windowsRestore(actual, descriptor);
    try {
      powershell(actual, "$acl=Get-Acl -LiteralPath $target;$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,[System.Security.AccessControl.FileSystemRights]::CreateFiles,[System.Security.AccessControl.InheritanceFlags]::None,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Deny);$acl.AddAccessRule($rule);Set-Acl -LiteralPath $target -AclObject $acl");
    } catch (error) { restore(); throw error; }
  } else {
    const mode = fs.statSync(actual).mode & 0o777;
    restore = () => fs.chmodSync(actual, mode);
    fs.chmodSync(actual, 0o500);
  }
  try {
    const probe = path.join(actual, '.permission-probe-' + randomUUID());
    let creationDenied = false;
    try { fs.writeFileSync(probe, 'fixture', { flag: 'wx' }); }
    catch (error) {
      if (!['EACCES', 'EPERM'].includes(error.code)) throw error;
      creationDenied = true;
    }
    if (!creationDenied) {
      fs.unlinkSync(probe);
      throw new Error('Permission fixture did not deny creation of a new file');
    }
    return work();
  } finally { restore(); }
}
function databaseSnapshot(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  return {
    version: db.pragma('user_version', { simple: true }),
    keys: db.pragma('foreign_keys', { simple: true }),
    schema: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all(),
    tables: tables.map(({ name }) => ({ name, rows: db.prepare('SELECT * FROM "' + name.replace(/"/g, '""') + '" ORDER BY rowid').all() })),
  };
}
module.exports = { withBackupWritesDenied, databaseSnapshot };
