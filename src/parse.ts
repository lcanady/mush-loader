/**
 * .mush file parser.
 *
 * Splits a .mush file into pre-install, main, and post-install sections.
 * All three sections are individually vetted before any is installed.
 *
 * Format:
 *   #!pre-install
 *   <mushcode>
 *   #!end-pre-install
 *
 *   <main mushcode>
 *
 *   #!post-install
 *   <mushcode>
 *   #!end-post-install
 *
 * The pre/post blocks can appear anywhere in the file; everything outside
 * them is treated as main code.
 */
import { ParsedMushFile } from './types';

const PRE_START  = /^#!pre-install\s*$/i;
const PRE_END    = /^#!end-pre-install\s*$/i;
const POST_START = /^#!post-install\s*$/i;
const POST_END   = /^#!end-post-install\s*$/i;

export function parseMushFile(source: string): ParsedMushFile {
  const lines = source.split('\n');

  const preLines: string[]  = [];
  const mainLines: string[] = [];
  const postLines: string[] = [];

  type Section = 'main' | 'pre' | 'post';
  let section: Section = 'main';

  for (const line of lines) {
    const trimmed = line.trim();

    if (PRE_START.test(trimmed)) {
      section = 'pre';
      continue;
    }
    if (PRE_END.test(trimmed)) {
      section = 'main';
      continue;
    }
    if (POST_START.test(trimmed)) {
      section = 'post';
      continue;
    }
    if (POST_END.test(trimmed)) {
      section = 'main';
      continue;
    }

    switch (section) {
      case 'pre':  preLines.push(line);  break;
      case 'post': postLines.push(line); break;
      case 'main': mainLines.push(line); break;
    }
  }

  return {
    raw:         source,
    preInstall:  preLines.join('\n').trim(),
    main:        mainLines.join('\n').trim(),
    postInstall: postLines.join('\n').trim(),
  };
}

/** Return a display label for a section in error messages. */
export function sectionLabel(section: keyof Omit<ParsedMushFile, 'raw'>): string {
  return { preInstall: 'pre-install', main: 'main', postInstall: 'post-install' }[section];
}
