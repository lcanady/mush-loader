/**
 * help-system.test.ts
 *
 * Integration tests for the +help system.
 * RED until softcode/help-system.mush has been loaded onto the game.
 *
 * Covers: topic lookup, visibility layers (hidden attr + locks), lock presets,
 * freeform locks, categories, wizard audit view, and hook invocation.
 */
import { RhostRunner } from '@rhost/testkit';

const PASS = process.env.RHOST_PASS;
if (!PASS) {
  console.error('RHOST_PASS env var is required');
  process.exit(1);
}

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = parseInt(process.env.RHOST_PORT ?? '4201', 10);
const USER = process.env.RHOST_USER ?? 'Wizard';

const runner = new RhostRunner();

runner.describe('+help system', ({ it, beforeAll, afterAll }) => {
  let helpObj: string;

  beforeAll(async ({ world, client }) => {
    helpObj = await client.eval('search(name=HelpSystem <sys>)');
    if (!helpObj.startsWith('#')) {
      throw new Error('HelpSystem <sys> not found — run softcode/help-system.mush first');
    }
    // Seed baseline topics
    await client.command('+help/set PublicTopic=Public help text about widgets.');
    await client.command('+help/set AnotherTopic=Another public topic.');
  });

  afterAll(async ({ client }) => {
    await client.command('+help/delete PublicTopic');
    await client.command('+help/delete AnotherTopic');
  });

  // -------------------------------------------------------------------------
  // Basic lookup
  // -------------------------------------------------------------------------

  it('+help bare shows index without error', async ({ client }) => {
    const lines = await client.command('+help');
    const output = lines.join(' ');
    if (lines.length === 0) throw new Error('+help produced no output');
    if (output.includes('#-1') || output.includes('#-2')) throw new Error(`+help error: ${output}`);
  });

  it('+help <topic> returns stored text', async ({ client }) => {
    const lines = await client.command('+help PublicTopic');
    const output = lines.join(' ');
    if (!output.includes('Public help text about widgets')) {
      throw new Error(`Expected topic text, got: ${output}`);
    }
  });

  it('+help <topic> is case-insensitive', async ({ client }) => {
    const lines = await client.command('+help publictopic');
    if (!lines.join(' ').includes('Public help text')) {
      throw new Error('Case-insensitive lookup failed');
    }
  });

  it('+help <unknown> shows not-found message, no error code', async ({ client }) => {
    const lines = await client.command('+help NoSuchTopicXYZ999');
    const output = lines.join(' ');
    if (lines.length === 0) throw new Error('+help unknown produced no output');
    if (output.includes('#-1') || output.includes('#-2')) throw new Error(`Raw error: ${output}`);
    if (!output.toLowerCase().includes('no help') && !output.toLowerCase().includes('not found')) {
      throw new Error(`Expected not-found message, got: ${output}`);
    }
  });

  // -------------------------------------------------------------------------
  // +help/list
  // -------------------------------------------------------------------------

  it('+help/list shows seeded topics', async ({ client }) => {
    const output = lines => lines.join(' ').toLowerCase();
    const lines = await client.command('+help/list');
    if (!output(lines).includes('publictopic')) throw new Error('PublicTopic missing from list');
    if (!output(lines).includes('anothertopic')) throw new Error('AnotherTopic missing from list');
  });

  it('+help/list produces no error codes', async ({ client }) => {
    const lines = await client.command('+help/list');
    const output = lines.join(' ');
    if (output.includes('#-1') || output.includes('#-2')) throw new Error(`list error: ${output}`);
  });

  // -------------------------------------------------------------------------
  // +help/search
  // -------------------------------------------------------------------------

  it('+help/search returns matching topics', async ({ client }) => {
    const lines = await client.command('+help/search widgets');
    if (!lines.join(' ').toLowerCase().includes('publictopic')) {
      throw new Error(`search widgets did not return PublicTopic`);
    }
  });

  it('+help/search with no match shows no-results message', async ({ client }) => {
    const lines = await client.command('+help/search xyzzy_nomatch_abc');
    const output = lines.join(' ');
    if (lines.length === 0) throw new Error('search no-match produced no output');
    if (!output.toLowerCase().includes('no')) throw new Error(`Expected no-results, got: ${output}`);
  });

  it('+help/search with no keyword shows usage', async ({ client }) => {
    const lines = await client.command('+help/search');
    const output = lines.join(' ');
    if (lines.length === 0) throw new Error('search empty produced no output');
    if (output.includes('#-1') || output.includes('#-2')) throw new Error(`Raw error: ${output}`);
  });

  // -------------------------------------------------------------------------
  // Hidden topics (_HELP_* attribute)
  // -------------------------------------------------------------------------

  it('+help/set/hidden creates a topic invisible to non-wizards', async ({ client, world }) => {
    await client.command('+help/set/hidden HiddenTopic=Secret staff notes.');
    // Verify wizard can read it
    const wiz = await client.command('+help HiddenTopic');
    if (!wiz.join(' ').includes('Secret staff notes')) {
      throw new Error('Wizard could not read hidden topic');
    }
    // Verify the attr starts with _ on the object
    const attrName = '_HELP_HIDDENTOPIC';
    const val = await client.eval(`get(${helpObj}/${attrName})`);
    if (!val.includes('Secret staff notes')) {
      throw new Error(`Expected _HELP_HIDDENTOPIC attr, got: ${val}`);
    }
    await client.command('+help/delete HiddenTopic');
  });

  it('hidden topic absent from +help/list for non-wizards', async ({ client, world }) => {
    await client.command('+help/set/hidden HiddenListTest=hidden text');
    const mortal = await world.createPlayer('TestMortal', 'pw');
    const mortClient = await world.connect(mortal);
    const lines = await mortClient.command('+help/list');
    await world.destroyPlayer(mortal);
    await client.command('+help/delete HiddenListTest');
    if (lines.join(' ').toLowerCase().includes('hiddenlisttest')) {
      throw new Error('Hidden topic appeared in non-wizard list');
    }
  });

  it('hidden topic returns not-found for non-wizards', async ({ client, world }) => {
    await client.command('+help/set/hidden HiddenReadTest=hidden text');
    const mortal = await world.createPlayer('TestMortal2', 'pw');
    const mortClient = await world.connect(mortal);
    const lines = await mortClient.command('+help HiddenReadTest');
    await world.destroyPlayer(mortal);
    await client.command('+help/delete HiddenReadTest');
    const output = lines.join(' ').toLowerCase();
    if (!output.includes('no help') && !output.includes('not found')) {
      throw new Error(`Expected not-found for hidden topic, got: ${output}`);
    }
  });

  // -------------------------------------------------------------------------
  // Lock presets
  // -------------------------------------------------------------------------

  it('+help/set/lock with preset "wizard" restricts to wizards', async ({ client, world }) => {
    await client.command('+help/set LockedTopic=wizard-only content');
    await client.command('+help/set/lock LockedTopic=wizard');
    // Verify lock attr stored
    const lock = await client.eval(`get(${helpObj}/HELPLOCK_LOCKEDTOPIC)`);
    if (!lock.includes('hasflag') && !lock.includes('wizard')) {
      throw new Error(`Expected wizard lock expression, got: ${lock}`);
    }
    // Non-wizard gets not-found
    const mortal = await world.createPlayer('TestMortal3', 'pw');
    const mortClient = await world.connect(mortal);
    const lines = await mortClient.command('+help LockedTopic');
    await world.destroyPlayer(mortal);
    await client.command('+help/delete LockedTopic');
    const output = lines.join(' ').toLowerCase();
    if (!output.includes('no help') && !output.includes('not found')) {
      throw new Error(`Non-wizard saw locked topic: ${output}`);
    }
  });

  it('+help/set/lock with preset "public" clears the lock', async ({ client }) => {
    await client.command('+help/set PresetPublicTest=public text');
    await client.command('+help/set/lock PresetPublicTest=wizard');
    await client.command('+help/set/lock PresetPublicTest=public');
    const lock = await client.eval(`get(${helpObj}/HELPLOCK_PRESETPUBLICTEST)`);
    if (lock && lock !== '1' && lock !== '') {
      throw new Error(`Expected lock cleared after public preset, got: ${lock}`);
    }
    await client.command('+help/delete PresetPublicTest');
  });

  it('+help/set/unlock removes lock attribute', async ({ client }) => {
    await client.command('+help/set UnlockTest=text');
    await client.command('+help/set/lock UnlockTest=wizard');
    await client.command('+help/set/unlock UnlockTest');
    const lock = await client.eval(`get(${helpObj}/HELPLOCK_UNLOCKTEST)`);
    if (lock && lock !== '' && lock !== '#-1 NO SUCH ATTRIBUTE') {
      throw new Error(`Expected lock absent after unlock, got: ${lock}`);
    }
    await client.command('+help/delete UnlockTest');
  });

  // -------------------------------------------------------------------------
  // Freeform lock expression
  // -------------------------------------------------------------------------

  it('+help/set/lock accepts freeform lock expression', async ({ client }) => {
    await client.command('+help/set FreeformLockTest=text');
    await client.command(`+help/set/lock FreeformLockTest=haspower(%#,builder)`);
    const lock = await client.eval(`get(${helpObj}/HELPLOCK_FREEFORMLOCKTEST)`);
    if (!lock.includes('haspower') || !lock.includes('builder')) {
      throw new Error(`Expected freeform lock stored, got: ${lock}`);
    }
    await client.command('+help/delete FreeformLockTest');
  });

  // -------------------------------------------------------------------------
  // Lock filtering in list and search
  // -------------------------------------------------------------------------

  it('locked topic absent from +help/list for non-wizards', async ({ client, world }) => {
    await client.command('+help/set ListLockTest=locked list test');
    await client.command('+help/set/lock ListLockTest=wizard');
    const mortal = await world.createPlayer('TestMortal4', 'pw');
    const mortClient = await world.connect(mortal);
    const lines = await mortClient.command('+help/list');
    await world.destroyPlayer(mortal);
    await client.command('+help/delete ListLockTest');
    if (lines.join(' ').toLowerCase().includes('listlocktest')) {
      throw new Error('Locked topic appeared in non-wizard list');
    }
  });

  it('locked topic absent from +help/search for non-wizards', async ({ client, world }) => {
    await client.command('+help/set SearchLockTest=locked search unique_kw_xyz');
    await client.command('+help/set/lock SearchLockTest=wizard');
    const mortal = await world.createPlayer('TestMortal5', 'pw');
    const mortClient = await world.connect(mortal);
    const lines = await mortClient.command('+help/search unique_kw_xyz');
    await world.destroyPlayer(mortal);
    await client.command('+help/delete SearchLockTest');
    if (lines.join(' ').toLowerCase().includes('searchlocktest')) {
      throw new Error('Locked topic appeared in non-wizard search');
    }
  });

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  it('+help/addcat creates a category visible in +help/cats', async ({ client }) => {
    await client.command('+help/addcat TestCat=Test category for integration tests');
    const lines = await client.command('+help/cats');
    const output = lines.join(' ').toLowerCase();
    if (!output.includes('testcat')) throw new Error('TestCat not in +help/cats');
    await client.command('+help/delcat TestCat');
  });

  it('+help/setcat assigns a topic to a category', async ({ client }) => {
    await client.command('+help/addcat CatA=Category A');
    await client.command('+help/set CatTopicTest=categorized text');
    await client.command('+help/setcat CatTopicTest=CatA');
    const cat = await client.eval(`get(${helpObj}/HELPCAT_CATOPICTEST)`);
    if (!cat.toLowerCase().includes('cata')) {
      throw new Error(`Expected category CatA, got: ${cat}`);
    }
    await client.command('+help/delete CatTopicTest');
    await client.command('+help/delcat CatA');
  });

  it('+help/list groups topics by category', async ({ client }) => {
    await client.command('+help/addcat CatB=Category B');
    await client.command('+help/set CatBTopic=text in catb');
    await client.command('+help/setcat CatBTopic=CatB');
    const lines = await client.command('+help/list');
    const output = lines.join('\n');
    const catIdx = output.toLowerCase().indexOf('catb');
    const topicIdx = output.toLowerCase().indexOf('catbtopic');
    if (catIdx === -1 || topicIdx === -1) throw new Error('Category grouping not present in list');
    if (catIdx > topicIdx) throw new Error('Category header appears after topic in list');
    await client.command('+help/delete CatBTopic');
    await client.command('+help/delcat CatB');
  });

  it('+help/list <cat> shows only topics in that category', async ({ client }) => {
    await client.command('+help/addcat CatC=Category C');
    await client.command('+help/set CatCTopic=catc text');
    await client.command('+help/setcat CatCTopic=CatC');
    const lines = await client.command('+help/list CatC');
    const output = lines.join(' ').toLowerCase();
    if (!output.includes('catctopic')) throw new Error('CatC topic not in filtered list');
    if (output.includes('publictopic')) throw new Error('Unrelated topic leaked into filtered list');
    await client.command('+help/delete CatCTopic');
    await client.command('+help/delcat CatC');
  });

  it('+help/delcat moves topics to Uncategorized', async ({ client }) => {
    await client.command('+help/addcat CatDel=To be deleted');
    await client.command('+help/set CatDelTopic=catdel text');
    await client.command('+help/setcat CatDelTopic=CatDel');
    await client.command('+help/delcat CatDel');
    const cat = await client.eval(`get(${helpObj}/HELPCAT_CATDELTOPIC)`);
    if (cat && cat !== '' && cat.toLowerCase() !== 'uncategorized') {
      throw new Error(`Expected empty/Uncategorized after delcat, got: ${cat}`);
    }
    await client.command('+help/delete CatDelTopic');
  });

  // -------------------------------------------------------------------------
  // +help/list/all — wizard audit view
  // -------------------------------------------------------------------------

  it('+help/list/all shows topics with lock expression', async ({ client }) => {
    await client.command('+help/set AuditTopic=audit text');
    await client.command('+help/set/lock AuditTopic=wizard');
    const lines = await client.command('+help/list/all');
    const output = lines.join(' ').toLowerCase();
    if (!output.includes('audittopic')) throw new Error('AuditTopic missing from /list/all');
    if (!output.includes('hasflag') && !output.includes('wizard')) {
      throw new Error('Lock expression not shown in /list/all');
    }
    await client.command('+help/delete AuditTopic');
  });

  // -------------------------------------------------------------------------
  // Hook attributes
  // -------------------------------------------------------------------------

  it('HOOK_FETCH and HOOK_SYNC attributes exist', async ({ client }) => {
    const fetch = await client.eval(`get(${helpObj}/HOOK_FETCH)`);
    const sync = await client.eval(`get(${helpObj}/HOOK_SYNC)`);
    if (fetch === '#-1 NO SUCH ATTRIBUTE') throw new Error('HOOK_FETCH missing');
    if (sync === '#-1 NO SUCH ATTRIBUTE') throw new Error('HOOK_SYNC missing');
  });

  it('HOOK_FETCH is called on cache miss', async ({ client }) => {
    await client.command(`&HOOK_FETCH ${helpObj}=[if(eq(%0,hookfetchtestxyz),Fetched from hook!,)]`);
    const lines = await client.command('+help hookfetchtestxyz');
    await client.command(`&HOOK_FETCH ${helpObj}=`);
    if (!lines.join(' ').includes('Fetched from hook!')) {
      throw new Error(`HOOK_FETCH not called. Got: ${lines.join(' ')}`);
    }
  });

  it('HOOK_SYNC is called after +help/set', async ({ client }) => {
    await client.command(`&HOOK_SYNC ${helpObj}=[set(${helpObj},SYNC_LOG:[v(SYNC_LOG)]|%0:%1)]`);
    await client.command('+help/set SyncTest=sync text');
    const log = await client.eval(`get(${helpObj}/SYNC_LOG)`);
    await client.command(`&HOOK_SYNC ${helpObj}=`);
    await client.command(`&SYNC_LOG ${helpObj}=`);
    await client.command('+help/delete SyncTest');
    if (!log.includes('set:synctest') && !log.includes('set:SyncTest')) {
      throw new Error(`HOOK_SYNC not called. SYNC_LOG: ${log}`);
    }
  });

  // -------------------------------------------------------------------------
  // Input validation / injection resistance
  // -------------------------------------------------------------------------

  it('+help/set rejects dangerous topic names', async ({ client }) => {
    const lines = await client.command('+help/set [evil;topic]=bad');
    const output = lines.join(' ');
    if (lines.length === 0) throw new Error('No output for dangerous topic name');
    if (output.includes('#-1') || output.includes('#-2')) throw new Error(`Raw error: ${output}`);
    if (!output.toLowerCase().includes('invalid')) {
      throw new Error(`Expected invalid-topic message, got: ${output}`);
    }
  });

  // -------------------------------------------------------------------------
  // Security: H1+H2 — lock expression injection (semicolons and brackets)
  // -------------------------------------------------------------------------

  it('H1/H2: +help/set/lock rejects lock expressions containing semicolons', async ({ client }) => {
    await client.command('+help/set InjSemiTest=text');
    const lines = await client.command('+help/set/lock InjSemiTest=1;@pemit %#=INJECTED');
    const output = lines.join(' ');
    await client.command('+help/delete InjSemiTest');
    if (output.includes('INJECTED')) {
      throw new Error('Semicolon injection in lock expression executed');
    }
    if (!output.toLowerCase().includes('semicolon') && !output.toLowerCase().includes('bracket')) {
      throw new Error(`Expected rejection message, got: ${output}`);
    }
  });

  it('H1: +help/set/lock rejects lock expressions containing opening brackets', async ({ client }) => {
    await client.command('+help/set InjBracketTest=text');
    const lines = await client.command('+help/set/lock InjBracketTest=[pemit all=BRACKET_INJECTED]');
    const output = lines.join(' ');
    await client.command('+help/delete InjBracketTest');
    if (output.includes('BRACKET_INJECTED')) {
      throw new Error('Bracket injection in lock expression executed');
    }
    if (!output.toLowerCase().includes('bracket') && !output.toLowerCase().includes('semicolon')) {
      throw new Error(`Expected rejection message for bracket, got: ${output}`);
    }
  });

  it('H1: bracket in lock expression is not stored on the object', async ({ client }) => {
    await client.command('+help/set BracketStorageTest=text');
    await client.command('+help/set/lock BracketStorageTest=[evil]');
    const lock = await client.eval(`get(${helpObj}/HELPLOCK_BRACKETSTORAGETEST)`);
    await client.command('+help/delete BracketStorageTest');
    if (lock && lock.includes('[') && lock !== '' && lock !== '#-1 NO SUCH ATTRIBUTE') {
      throw new Error(`Bracket lock expression was stored: ${lock}`);
    }
  });

  // -------------------------------------------------------------------------
  // Security: M1 — wizard help text display (not truncated)
  // -------------------------------------------------------------------------

  it('M1: wizard sees full multi-word help text, not just first word', async ({ client }) => {
    await client.command('+help/set MultiWordTest=This is a multi-word help entry with several words.');
    const lines = await client.command('+help MultiWordTest');
    await client.command('+help/delete MultiWordTest');
    const output = lines.join(' ');
    if (!output.includes('multi-word help entry')) {
      throw new Error(`Wizard saw truncated text. Got: ${output}`);
    }
  });

  it('M1: wizard sees hidden topic full text, not truncated', async ({ client }) => {
    await client.command('+help/set/hidden HiddenMultiWordTest=Hidden multi-word content is complete.');
    const lines = await client.command('+help HiddenMultiWordTest');
    await client.command('+help/delete HiddenMultiWordTest');
    const output = lines.join(' ');
    if (!output.includes('Hidden multi-word content is complete')) {
      throw new Error(`Wizard saw truncated hidden text. Got: ${output}`);
    }
  });

  // -------------------------------------------------------------------------
  // Security: M2 — search uses literal substring, not glob
  // -------------------------------------------------------------------------

  it('M2: +help/search * does not match all topics (literal substring, not glob)', async ({ client }) => {
    // A topic whose text does not contain a literal asterisk
    await client.command('+help/set GlobSafeTest=This text has no asterisk.');
    const lines = await client.command('+help/search *');
    await client.command('+help/delete GlobSafeTest');
    const output = lines.join(' ').toLowerCase();
    // If glob were used, GlobSafeTest would match *. With literal search it should not.
    if (output.includes('globsafetest')) {
      throw new Error('+help/search * matched topic with no asterisk — glob still active');
    }
  });

  it('M2: +help/search finds literal substring correctly', async ({ client }) => {
    await client.command('+help/set LiteralSearchTest=unique_substring_xyz here');
    const lines = await client.command('+help/search unique_substring_xyz');
    await client.command('+help/delete LiteralSearchTest');
    if (!lines.join(' ').toLowerCase().includes('literalsearchtest')) {
      throw new Error('+help/search did not find topic by literal substring');
    }
  });

  // -------------------------------------------------------------------------
  // Preset storage
  // -------------------------------------------------------------------------

  it('lock presets exist on HelpSystem <sys>', async ({ client }) => {
    for (const preset of ['PRESET_PUBLIC', 'PRESET_WIZARD', 'PRESET_ROYALTY', 'PRESET_STAFF']) {
      const val = await client.eval(`get(${helpObj}/${preset})`);
      if (val === '#-1 NO SUCH ATTRIBUTE') {
        throw new Error(`${preset} missing from HelpSystem`);
      }
    }
  });
});

runner
  .run({ host: HOST, port: PORT, username: USER, password: PASS })
  .then(r => process.exit(r.failed > 0 ? 1 : 0))
  .catch(err => { console.error(err.message); process.exit(1); });
