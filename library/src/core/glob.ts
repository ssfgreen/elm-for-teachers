/**
 * A path glob as a regular expression: `**` is any run of characters, `*` any run without a
 * slash, `?` one character that is not a slash. Everything else is literal.
 */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        out += '(?:.*/)?';
      } else out += '.*';
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** Whether a path matches an optional glob. No glob matches every path. */
export function matchesGlob(path: string, glob: string | undefined): boolean {
  if (!glob) return true;
  return globToRegExp(glob).test(path);
}
