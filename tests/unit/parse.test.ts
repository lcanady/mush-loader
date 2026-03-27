import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseMushFile, sectionLabel } from '../../src/parse';

describe('parseMushFile', () => {
  test('plain file — all code goes to main', () => {
    const src = '@create Foo\n&VERSION Foo=1.0';
    const r = parseMushFile(src);
    assert.ok(r.main.includes('@create Foo'));
    assert.equal(r.preInstall, '');
    assert.equal(r.postInstall, '');
  });

  test('pre-install block is extracted', () => {
    const src = '#!pre-install\nthink pre\n#!end-pre-install\n@create Foo';
    const r = parseMushFile(src);
    assert.ok(r.preInstall.includes('think pre'));
    assert.ok(r.main.includes('@create Foo'));
    assert.equal(r.postInstall, '');
  });

  test('post-install block is extracted', () => {
    const src = '@create Foo\n#!post-install\nthink post\n#!end-post-install';
    const r = parseMushFile(src);
    assert.ok(r.postInstall.includes('think post'));
    assert.ok(r.main.includes('@create Foo'));
    assert.equal(r.preInstall, '');
  });

  test('all three sections present', () => {
    const src = [
      '#!pre-install',
      'think pre',
      '#!end-pre-install',
      '@create Foo',
      '#!post-install',
      'think post',
      '#!end-post-install',
    ].join('\n');
    const r = parseMushFile(src);
    assert.ok(r.preInstall.includes('think pre'));
    assert.ok(r.main.includes('@create Foo'));
    assert.ok(r.postInstall.includes('think post'));
  });

  test('markers are case-insensitive', () => {
    const src = '#!PRE-INSTALL\nthink pre\n#!END-PRE-INSTALL\n@create Foo';
    const r = parseMushFile(src);
    assert.ok(r.preInstall.includes('think pre'));
  });

  test('markers are not included in section content', () => {
    const src = '#!pre-install\nthink pre\n#!end-pre-install\n@create Foo';
    const r = parseMushFile(src);
    assert.ok(!r.preInstall.includes('#!pre-install'));
    assert.ok(!r.preInstall.includes('#!end-pre-install'));
  });

  test('main code does not include pre/post content', () => {
    const src = [
      '#!pre-install',
      'think pre',
      '#!end-pre-install',
      '@create Foo',
      '#!post-install',
      'think post',
      '#!end-post-install',
    ].join('\n');
    const r = parseMushFile(src);
    assert.ok(!r.main.includes('think pre'));
    assert.ok(!r.main.includes('think post'));
  });

  test('empty file produces empty sections', () => {
    const r = parseMushFile('');
    assert.equal(r.preInstall, '');
    assert.equal(r.main, '');
    assert.equal(r.postInstall, '');
  });

  test('raw field contains original source unchanged', () => {
    const src = '#!pre-install\nthink pre\n#!end-pre-install\n@create Foo';
    const r = parseMushFile(src);
    assert.equal(r.raw, src);
  });
});

describe('sectionLabel', () => {
  test('preInstall → "pre-install"', () => {
    assert.equal(sectionLabel('preInstall'), 'pre-install');
  });
  test('main → "main"', () => {
    assert.equal(sectionLabel('main'), 'main');
  });
  test('postInstall → "post-install"', () => {
    assert.equal(sectionLabel('postInstall'), 'post-install');
  });
});
