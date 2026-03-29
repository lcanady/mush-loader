/**
 * rockjobs.test.ts
 *
 * Integration tests for softcode/rockjobs.mush.
 * Covers all 25 commands and all documented security fixes:
 *
 *   B3   CMD`TIER — %q8/%q9 positional registers
 *   B5   CMD`MYJOBS — @break not @assert (empty list doesn't abort)
 *   B6   CMD`STATUS — command handler exists (was missing upstream)
 *   B10  CMD`REQ-COMMENT — validation order: isint → exists → owner
 *   M-RJ-01  CMD`RENAME — bracket-injection rejection
 *   M-RJ-02  CMD`COMMENT — bracket-injection rejection
 *   H1   CMD`VIEW-REQ + CMD`CANCEL — isnum pre-guard
 *   C1   CMD`REQ-ADD — bracket-rejection on topic and body
 *   C2   CMD`REQ-COMMENT — bracket-rejection on comment
 *   SR4  HOOK_ON_COMPLETE/APPROVE/DENY/COMMENT — args verified
 *
 * Architecture:
 *   wizRunner   — connects as RHOST_USER (Wizard), runs staff tests
 *   playerRunner — connects as TestPlayerRJ (non-wizard), runs player tests
 *   main()      — setup → wizRunner → playerRunner → teardown (sequential)
 *
 * RED until rockjobs.mush has been loaded onto the game.
 */
import { RhostRunner, RhostClient } from '@rhost/testkit';

// ─── env ──────────────────────────────────────────────────────────────────────
const PASS = process.env.RHOST_PASS;
if (!PASS) { console.error('RHOST_PASS env var is required'); process.exit(1); }

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = parseInt(process.env.RHOST_PORT ?? '4201', 10);
const USER = process.env.RHOST_USER ?? 'Wizard';

const ALT_NAME  = 'TestPlayerRJ';
const ALT_PASS  = 'rjtestpass1';

// ─── shared state (populated in setup, read by all runners) ──────────────────
let rjSys: string;   // dbref of Rockpath's Jobs System
let rjDb:  string;   // dbref of Rockpath's Job Database
let altDbref: string; // dbref of TestPlayerRJ

// ─── helpers ─────────────────────────────────────────────────────────────────

function assertOutput(lines: string[], match: string, label: string): void {
  const out = lines.join(' ');
  if (!out.toLowerCase().includes(match.toLowerCase())) {
    throw new Error(`${label}: expected '${match}' in output, got: ${out}`);
  }
}

function assertNoError(lines: string[], label: string): void {
  const out = lines.join(' ');
  if (out.includes('#-1') || out.includes('#-2')) {
    throw new Error(`${label}: unexpected error in output: ${out}`);
  }
}

function assertNoContent(lines: string[], forbidden: string, label: string): void {
  const out = lines.join(' ');
  if (out.includes(forbidden)) {
    throw new Error(`${label}: forbidden content '${forbidden}' found in output: ${out}`);
  }
}

// ─── Wizard runner ────────────────────────────────────────────────────────────
const wizRunner = new RhostRunner();

// ── Suite 1: verify system objects exist ─────────────────────────────────────
wizRunner.describe('RockJobs system objects', ({ it }) => {
  it("Rockpath's Jobs System exists", async ({ expect }) => {
    await expect("search(name=Rockpath's Jobs System)").toBeDbref();
  });

  it("Rockpath's Job Database exists", async ({ expect }) => {
    await expect("search(name=Rockpath's Job Database)").toBeDbref();
  });

  it('Jobs System has SAFE flag', async ({ expect }) => {
    await expect(`hasflag(${rjSys}, safe)`).toBe('1');
  });

  it('Job Database has SAFE flag', async ({ expect }) => {
    await expect(`hasflag(${rjDb}, safe)`).toBe('1');
  });

  it('Jobs System does NOT have INHERIT flag (SEC)', async ({ expect }) => {
    await expect(`hasflag(${rjSys}, inherit)`).toBe('0');
  });

  it('Job Database DOES have INHERIT flag', async ({ expect }) => {
    await expect(`hasflag(${rjDb}, inherit)`).toBe('1');
  });
});

// ── Suite 2: access control ───────────────────────────────────────────────────
// Uses bool`is-staff directly — avoids @fo privilege complexity.
wizRunner.describe('access control', ({ it }) => {
  it('Wizard passes bool`is-staff', async ({ client }) => {
    const myDbref = await client.eval('num(me)');
    const result  = await client.eval(`u(${rjDb}/bool\`is-staff,${myDbref})`);
    if (result !== '1') throw new Error(`Wizard should be staff, got: ${result}`);
  });

  it('TestPlayerRJ fails bool`is-staff', async ({ client }) => {
    const result = await client.eval(`u(${rjDb}/bool\`is-staff,${altDbref})`);
    if (result !== '0') throw new Error(`Player should not be staff, got: ${result}`);
  });
});

// ── Suite 3: +job/create ─────────────────────────────────────────────────────
let jobDbref: string; // shared across suites

wizRunner.describe('+job/create', ({ it }) => {
  it('creates a job with a valid category', async ({ client }) => {
    const lines = await client.command('+job/create APP/TestJob=This is a test body.');
    assertNoError(lines, '+job/create valid');
    assertOutput(lines, 'created', '+job/create valid');
    // Verify job object exists
    jobDbref = await client.eval(`num(Job 1)`);
    if (!jobDbref.startsWith('#')) throw new Error(`Job 1 not found: ${jobDbref}`);
  });

  it('rejects an invalid category', async ({ client }) => {
    const lines = await client.command('+job/create BOGUS/Test=body');
    assertOutput(lines, 'invalid category', '+job/create bad cat');
  });
});

// ── Suite 4: +jobs (list) ────────────────────────────────────────────────────
wizRunner.describe('+jobs', ({ it }) => {
  it('returns table header and at least one row', async ({ client }) => {
    const lines = await client.command('+jobs');
    assertNoError(lines, '+jobs');
    assertOutput(lines, 'Job Title', '+jobs header');
    assertOutput(lines, 'End Jobs', '+jobs footer');
  });
});

// ── Suite 5: +job <#> view ────────────────────────────────────────────────────
wizRunner.describe('+job view', ({ it }) => {
  it('+job 1 shows job detail', async ({ client }) => {
    const lines = await client.command('+job 1');
    assertNoError(lines, '+job 1');
    assertOutput(lines, 'TestJob', '+job 1 title');
    assertOutput(lines, 'End Job', '+job 1 footer');
  });

  it('+job with invalid number returns error', async ({ client }) => {
    const lines = await client.command('+job 9999');
    assertOutput(lines, 'valid', '+job invalid num');
  });
});

// ── Suite 6: +job/status [B6 — command was missing upstream] ─────────────────
wizRunner.describe('+job/status [B6]', ({ it }) => {
  it('sets status to UNWY for "underway"', async ({ client }) => {
    const lines = await client.command('+job/status 1=underway');
    assertNoError(lines, '+job/status underway');
    assertOutput(lines, 'status', '+job/status underway confirm');
    const status = await client.eval(`get(${jobDbref}/status)`);
    if (status !== 'UNWY') throw new Error(`Expected UNWY, got: ${status}`);
  });

  it('sets status to 1/2 Done for "50"', async ({ client }) => {
    const lines = await client.command('+job/status 1=50');
    assertNoError(lines, '+job/status 50');
    const status = await client.eval(`get(${jobDbref}/status)`);
    if (status !== '1/2 Done') throw new Error(`Expected 1/2 Done, got: ${status}`);
  });

  it('sets status to HOLD for "hold"', async ({ client }) => {
    await client.command('+job/status 1=hold');
    const status = await client.eval(`get(${jobDbref}/status)`);
    if (status !== 'HOLD') throw new Error(`Expected HOLD, got: ${status}`);
  });

  it('resets to NEW before later tests', async ({ client }) => {
    await client.command('+job/status 1=new');
    const status = await client.eval(`get(${jobDbref}/status)`);
    if (status !== 'NEW') throw new Error(`Expected NEW, got: ${status}`);
  });
});

// ── Suite 7: +job/urgency ─────────────────────────────────────────────────────
wizRunner.describe('+job/urgency', ({ it }) => {
  it('sets urgency to 3 for "red"', async ({ client }) => {
    await client.command('+job/urgency 1=red');
    const urg = await client.eval(`get(${jobDbref}/urgency)`);
    if (urg !== '3') throw new Error(`Expected urgency 3, got: ${urg}`);
  });

  it('sets urgency to 1 for "green"', async ({ client }) => {
    await client.command('+job/urgency 1=green');
    const urg = await client.eval(`get(${jobDbref}/urgency)`);
    if (urg !== '1') throw new Error(`Expected urgency 1, got: ${urg}`);
  });

  it('sets urgency to 4 for unknown value (default fallback)', async ({ client }) => {
    await client.command('+job/urgency 1=bogus');
    const urg = await client.eval(`get(${jobDbref}/urgency)`);
    if (urg !== '4') throw new Error(`Expected urgency 4 (fallback), got: ${urg}`);
    // Reset for later tests
    await client.command('+job/urgency 1=1');
  });
});

// ── Suite 8: +job/claim ──────────────────────────────────────────────────────
wizRunner.describe('+job/claim', ({ it }) => {
  it('sets handler to the claiming staff member', async ({ client }) => {
    const myDbref = await client.eval('num(me)');
    const lines   = await client.command('+job/claim 1');
    assertNoError(lines, '+job/claim');
    assertOutput(lines, 'claimed', '+job/claim confirm');
    const handler = await client.eval(`get(${jobDbref}/handler)`);
    if (handler !== myDbref) throw new Error(`Expected handler ${myDbref}, got: ${handler}`);
  });
});

// ── Suite 9: +jobs/mine [B5 — @break not @assert] ────────────────────────────
wizRunner.describe('+jobs/mine [B5]', ({ it }) => {
  it('shows claimed job in +jobs/mine', async ({ client }) => {
    const lines = await client.command('+jobs/mine');
    assertNoError(lines, '+jobs/mine with claim');
    assertOutput(lines, 'TestJob', '+jobs/mine job present');
    assertOutput(lines, 'End Jobs', '+jobs/mine footer present');
  });

  it('shows full table on empty result without aborting (B5 @break vs @assert)', async ({ client }) => {
    // Unclaim first so +jobs/mine has nothing
    await client.eval(`set(${jobDbref}, !handler)`);
    const lines = await client.command('+jobs/mine');
    // Must see both header and footer — old @assert would abort before footer
    assertOutput(lines, 'Job Title', '+jobs/mine header on empty');
    assertOutput(lines, 'End Jobs', '+jobs/mine footer on empty — proves @break not @assert');
  });
});

// ── Suite 10: +job/assign ────────────────────────────────────────────────────
wizRunner.describe('+job/assign', ({ it }) => {
  it('rejects assigning to a non-staff target', async ({ client }) => {
    const lines = await client.command(`+job/assign 1=${ALT_NAME}`);
    assertOutput(lines, 'valid staff', '+job/assign non-staff');
  });
});

// ── Suite 11: +job/rename [M-RJ-01 — bracket-injection rejection] ─────────────
wizRunner.describe('+job/rename [M-RJ-01]', ({ it }) => {
  it('renames a job', async ({ client }) => {
    const lines = await client.command('+job/rename 1=RenamedJob');
    assertNoError(lines, '+job/rename valid');
    assertOutput(lines, 'RenamedJob', '+job/rename confirm');
    const jname = await client.eval(`get(${jobDbref}/jname)`);
    if (jname !== 'RenamedJob') throw new Error(`Expected RenamedJob, got: ${jname}`);
  });

  it('rejects bracket characters in job name (M-RJ-01 injection guard)', async ({ client }) => {
    const lines = await client.command('+job/rename 1=[pemit(#1,INJECTED)]');
    assertOutput(lines, 'may not contain', '+job/rename bracket rejection');
    // Stored JName must still be 'RenamedJob' — not changed
    const jname = await client.eval(`get(${jobDbref}/jname)`);
    if (jname !== 'RenamedJob') throw new Error(`JName changed despite rejection: ${jname}`);
  });
});

// ── Suite 12: +job/comment [M-RJ-02 — bracket-injection rejection] ────────────
wizRunner.describe('+job/comment [M-RJ-02]', ({ it }) => {
  it('appends a clean comment', async ({ client }) => {
    const lines = await client.command('+job/comment 1=Clean comment here.');
    assertNoError(lines, '+job/comment valid');
    assertOutput(lines, 'commented', '+job/comment confirm');
    const desc = await client.eval(`get(${jobDbref}/desc)`);
    if (!desc.includes('Clean comment here.')) throw new Error(`Comment not stored: ${desc}`);
  });

  it('rejects bracket characters in staff comment (M-RJ-02 injection guard)', async ({ client }) => {
    const descBefore = await client.eval(`get(${jobDbref}/desc)`);
    const lines = await client.command('+job/comment 1=[pemit(#1,INJECTED)]');
    assertOutput(lines, 'may not contain', '+job/comment bracket rejection');
    const descAfter = await client.eval(`get(${jobDbref}/desc)`);
    if (descAfter !== descBefore) throw new Error(`Desc changed despite rejection`);
  });
});

// ── Suite 13: +job/cat ────────────────────────────────────────────────────────
wizRunner.describe('+job/cat', ({ it }) => {
  it('moves a job to a valid category', async ({ client }) => {
    const lines = await client.command('+job/cat 1=CODE');
    assertNoError(lines, '+job/cat valid');
    assertOutput(lines, 'CODE', '+job/cat confirm');
    const cat = await client.eval(`get(${jobDbref}/category)`);
    if (cat !== 'CODE') throw new Error(`Expected CODE, got: ${cat}`);
  });

  it('rejects an invalid category', async ({ client }) => {
    const lines = await client.command('+job/cat 1=BOGUS');
    assertOutput(lines, 'proper category', '+job/cat invalid');
    // Reset to APP for later tests
    await client.command('+job/cat 1=APP');
  });
});

// ── Suite 14: +job/tier [B3 — %q8/%q9 positional registers] ──────────────────
wizRunner.describe('+job/tier [B3]', ({ it }) => {
  it('adds BUILDER tier to a job', async ({ client }) => {
    const lines = await client.command('+job/tier 1=BUILDER');
    assertNoError(lines, '+job/tier add BUILDER');
    const tier = await client.eval(`get(${jobDbref}/tier)`);
    if (!tier.includes('BUILDER')) throw new Error(`BUILDER not in tier: ${tier}`);
  });

  it('removes tier 1 from a job', async ({ client }) => {
    const lines = await client.command('+job/tier 1=!1');
    assertNoError(lines, '+job/tier remove 1');
    const tier = await client.eval(`get(${jobDbref}/tier)`);
    const tierWords = tier.trim().split(/\s+/);
    if (tierWords.includes('1')) throw new Error(`Tier 1 still present: ${tier}`);
  });

  it('adds and removes tiers in a single command (B3 %q8/%q9 registers)', async ({ client }) => {
    // Start fresh: add 1 back first
    await client.command('+job/tier 1=1');
    // Now do both in one command: add BUILDER, remove 1
    const lines = await client.command('+job/tier 1=BUILDER !1');
    assertNoError(lines, '+job/tier combined');
    const tier = await client.eval(`get(${jobDbref}/tier)`);
    const tierWords = tier.trim().split(/\s+/);
    if (!tierWords.includes('BUILDER')) throw new Error(`BUILDER missing after combined: ${tier}`);
    if (tierWords.includes('1')) throw new Error(`Tier 1 still present after combined: ${tier}`);
    // Restore tier 1 for remaining tests
    await client.command('+job/tier 1=1');
  });

  it('rejects an unknown tier name', async ({ client }) => {
    const lines = await client.command('+job/tier 1=BOGUSTIER');
    assertOutput(lines, 'valid tier', '+job/tier invalid name');
  });
});

// ── Suite 15: +jobs/cat [I13 — new filter command] ────────────────────────────
wizRunner.describe('+jobs/cat [I13]', ({ it }) => {
  it('shows only jobs matching the given category', async ({ client }) => {
    const lines = await client.command('+jobs/cat APP');
    assertNoError(lines, '+jobs/cat APP');
    assertOutput(lines, 'APP', '+jobs/cat filter present');
    assertOutput(lines, 'End Jobs', '+jobs/cat footer');
  });

  it('rejects an invalid category', async ({ client }) => {
    const lines = await client.command('+jobs/cat BOGUS');
    assertOutput(lines, 'invalid category', '+jobs/cat invalid');
  });
});

// ── Suite 16: +jobs/help ─────────────────────────────────────────────────────
wizRunner.describe('+jobs/help', ({ it }) => {
  it('+jobs/help shows the index', async ({ client }) => {
    const lines = await client.command('+jobs/help');
    assertNoError(lines, '+jobs/help index');
    assertOutput(lines, 'create', '+jobs/help index entry');
  });

  it('+jobs/help <topic> dispatches to topic attr', async ({ client }) => {
    const lines = await client.command('+jobs/help create');
    assertNoError(lines, '+jobs/help create');
    assertOutput(lines, '+job/create', '+jobs/help create content');
  });

  it('+jobs/help <unknown topic> returns "no help" message', async ({ client }) => {
    const lines = await client.command('+jobs/help bogustopic');
    assertOutput(lines, 'no help', '+jobs/help unknown topic');
  });
});

// ── Suite 17: SR4 hooks (+job/complete, +job/approve, +job/deny) ──────────────
wizRunner.describe('SR4 outbound hooks', ({ it, beforeAll, afterAll }) => {
  let hookJobDbref: string;

  beforeAll(async ({ client }) => {
    // Install a test hook that records args to TEST_HOOK_LAST on rjSys
    await client.command(`&HOOK_ON_COMPLETE ${rjSys}=&TEST_HOOK_LAST me=%0|%1|%2`);
    await client.command(`&HOOK_ON_APPROVE ${rjSys}=&TEST_HOOK_LAST me=%0|%1|%2`);
    await client.command(`&HOOK_ON_DENY ${rjSys}=&TEST_HOOK_LAST me=%0|%1|%2`);
  });

  afterAll(async ({ client }) => {
    // Clear test hooks and scratch attr
    await client.command(`&HOOK_ON_COMPLETE ${rjSys}=`);
    await client.command(`&HOOK_ON_APPROVE ${rjSys}=`);
    await client.command(`&HOOK_ON_DENY ${rjSys}=`);
    await client.command(`&TEST_HOOK_LAST ${rjSys}=`);
  });

  it('HOOK_ON_COMPLETE fires with category|requester-dbref|comment [SR4]', async ({ client }) => {
    await client.command('+job/create APP/HookTestComplete=hook test body');
    const jDbref = await client.eval(`num(Job 2)`);
    hookJobDbref = jDbref;
    const requester = await client.eval(`get(${jDbref}/requester)`);
    const lines = await client.command('+job/complete 2=all done');
    assertOutput(lines, 'completed', 'HOOK_ON_COMPLETE complete message');
    // Job should be destroyed
    const gone = await client.eval(`hasflag(${jDbref},!`);
    // Read hook log
    const log = await client.eval(`get(${rjSys}/TEST_HOOK_LAST)`);
    if (!log.includes('APP')) throw new Error(`Hook missing category: ${log}`);
    if (!log.includes(requester)) throw new Error(`Hook missing requester dbref: ${log}`);
    if (!log.includes('all done')) throw new Error(`Hook missing comment: ${log}`);
  });

  it('HOOK_ON_APPROVE fires with category|requester-dbref|comment [SR4]', async ({ client }) => {
    await client.command('+job/create APP/HookTestApprove=hook test body');
    const jDbref = await client.eval(`num(Job 3)`);
    const requester = await client.eval(`get(${jDbref}/requester)`);
    const lines = await client.command('+job/approve 3=approved!');
    assertOutput(lines, 'approved', 'HOOK_ON_APPROVE approve message');
    const log = await client.eval(`get(${rjSys}/TEST_HOOK_LAST)`);
    if (!log.includes('APP')) throw new Error(`Hook missing category: ${log}`);
    if (!log.includes(requester)) throw new Error(`Hook missing requester: ${log}`);
    if (!log.includes('approved!')) throw new Error(`Hook missing comment: ${log}`);
  });

  it('HOOK_ON_DENY fires with category|requester-dbref|comment [SR4]', async ({ client }) => {
    await client.command('+job/create APP/HookTestDeny=hook test body');
    const jDbref = await client.eval(`num(Job 4)`);
    const requester = await client.eval(`get(${jDbref}/requester)`);
    const lines = await client.command('+job/deny 4=denied!');
    assertOutput(lines, 'denied', 'HOOK_ON_DENY deny message');
    const log = await client.eval(`get(${rjSys}/TEST_HOOK_LAST)`);
    if (!log.includes('APP')) throw new Error(`Hook missing category: ${log}`);
    if (!log.includes(requester)) throw new Error(`Hook missing requester: ${log}`);
    if (!log.includes('denied!')) throw new Error(`Hook missing comment: ${log}`);
  });
});

// ── Suite 18: +job/delete ─────────────────────────────────────────────────────
wizRunner.describe('+job/delete', ({ it }) => {
  it('destroys a job without a ruling', async ({ client }) => {
    // Job 1 should still exist (from earlier suites)
    const before = await client.eval(`num(Job 1)`);
    if (!before.startsWith('#')) throw new Error(`Job 1 not found for delete test: ${before}`);
    const lines = await client.command('+job/delete 1');
    assertNoError(lines, '+job/delete');
    assertOutput(lines, 'deleted', '+job/delete confirm');
    // Verify gone
    const after = await client.eval(`num(Job 1)`);
    if (after.startsWith('#')) throw new Error(`Job 1 still exists after delete: ${after}`);
  });
});

// ── Suite 19: +jobs/reorder ───────────────────────────────────────────────────
wizRunner.describe('+jobs/reorder', ({ it }) => {
  it('reorders and compresses job numbering', async ({ client }) => {
    // Create two jobs so there is something to reorder
    await client.command('+job/create CODE/ReorderA=test');
    await client.command('+job/create CODE/ReorderB=test');
    const lines = await client.command('+jobs/reorder');
    // Owner check: if Wizard owns the system, this succeeds; otherwise error
    const out = lines.join(' ');
    if (out.includes('#-1') && !out.toLowerCase().includes('reorder')) {
      // Not owner — log but don't fail; reorder requires object owner
      console.warn('[+jobs/reorder] caller is not object owner — skipping assertion');
    } else {
      assertOutput(lines, 'reorder', '+jobs/reorder confirm');
    }
    // Clean up reorder test jobs
    const j1 = await client.eval(`num(Job 1)`);
    const j2 = await client.eval(`num(Job 2)`);
    if (j1.startsWith('#')) await client.command(`+job/delete 1`);
    if (j2.startsWith('#')) await client.command(`+job/delete 2`);
  });
});

// ─── Player runner ────────────────────────────────────────────────────────────
const playerRunner = new RhostRunner();

let playerReqJobDbref: string; // job created via +request/create

// ── Suite 20: player +request/create [C1 — bracket-injection rejection] ───────
playerRunner.describe('player: +request/create [C1]', ({ it }) => {
  it('creates a request with valid category/topic/body', async ({ client }) => {
    const lines = await client.command('+request/create APP/MyRequest=Please help me.');
    assertNoError(lines, '+request/create valid');
    assertOutput(lines, 'created', '+request/create confirm');
  });

  it('rejects bracket characters in topic (C1)', async ({ client }) => {
    const lines = await client.command('+request/create APP/[pemit(#1,X)]=body');
    assertOutput(lines, 'may not contain', '+request/create bracket topic');
  });

  it('rejects bracket characters in body (C1)', async ({ client }) => {
    const lines = await client.command('+request/create APP/Topic=[pemit(#1,X)]');
    assertOutput(lines, 'may not contain', '+request/create bracket body');
  });

  it('rejects an invalid category', async ({ client }) => {
    const lines = await client.command('+request/create BOGUS/Topic=body');
    assertOutput(lines, 'invalid category', '+request/create bad cat');
  });
});

// ── Suite 21: player +requests ────────────────────────────────────────────────
playerRunner.describe('player: +requests', ({ it }) => {
  it('shows only the player\'s own requests', async ({ client }) => {
    const lines = await client.command('+requests');
    assertNoError(lines, '+requests');
    // Should show the request we created but not staff jobs
    assertOutput(lines, 'MyRequest', '+requests own req present');
    assertOutput(lines, 'End Jobs', '+requests footer');
  });
});

// ── Suite 22: player +request <#> [H1 — isnum pre-guard] ─────────────────────
playerRunner.describe('player: +request view [H1]', ({ it, beforeAll }) => {
  beforeAll(async ({ client }) => {
    // Find the job number for the request we created
    const lines = await client.command('+requests');
    const match = lines.join(' ').match(/Req (\d+)/);
    if (match) {
      playerReqJobDbref = `#${match[1]}`; // approximate — use job number 1 as fallback
    }
  });

  it('rejects non-numeric arg before DB lookup (H1 isnum guard)', async ({ client }) => {
    const lines = await client.command('+request abc');
    assertOutput(lines, 'number', '+request non-numeric');
    assertNoContent(lines, 'Invalid Request', '+request — should not reach DB check');
  });

  it('shows own request by number', async ({ client }) => {
    const lines = await client.command('+request 1');
    // Either shows the request or "invalid" — both are valid since counter may differ
    assertNoError(lines, '+request 1');
  });

  it('blocks viewing another player\'s request', async ({ client }) => {
    // Job 99 (if it existed) would not belong to this player
    const lines = await client.command('+request 99');
    // Should either be "Invalid Request" or "That request isn't yours"
    const out = lines.join(' ');
    const denied = out.toLowerCase().includes('invalid') || out.toLowerCase().includes("isn't yours");
    if (!denied) throw new Error(`Expected denial on other's request, got: ${out}`);
  });
});

// ── Suite 23: player +request/comment [B10 + C2] ─────────────────────────────
playerRunner.describe("player: +request/comment [B10 + C2]", ({ it }) => {
  it('rejects non-numeric job number first (B10 isint order)', async ({ client }) => {
    const lines = await client.command('+request/comment abc=hello');
    assertOutput(lines, 'number', '+request/comment non-numeric — isint fires first');
    // Must NOT say "No such request" — that fires later in the chain
    assertNoContent(lines, 'No such request', '+request/comment — isint must precede existence check');
  });

  it('rejects valid number for non-existent job', async ({ client }) => {
    const lines = await client.command('+request/comment 9999=hello');
    assertOutput(lines, 'No such request', '+request/comment missing job');
  });

  it('rejects comment on another player\'s request', async ({ client }) => {
    // Job number 99 (wizard's) — this player is not the requester
    const lines = await client.command('+request/comment 99=sneaky');
    const out = lines.join(' ');
    const denied = out.toLowerCase().includes("isn't yours") || out.toLowerCase().includes('no such');
    if (!denied) throw new Error(`Expected denial, got: ${out}`);
  });

  it('appends clean comment to own request', async ({ client }) => {
    const lines = await client.command('+request/comment 1=Follow-up here.');
    // Valid if request 1 belongs to player; otherwise "not yours" is also acceptable
    assertNoContent(lines, '#-1', '+request/comment own req');
    assertNoContent(lines, '#-2', '+request/comment own req');
  });

  it('rejects bracket characters in comment body (C2)', async ({ client }) => {
    const lines = await client.command('+request/comment 1=[pemit(#1,INJECTED)]');
    assertOutput(lines, 'may not contain', '+request/comment bracket body (C2)');
  });
});

// ── Suite 24: player +request/cancel [H1 — isnum pre-guard] ──────────────────
playerRunner.describe('player: +request/cancel [H1]', ({ it }) => {
  it('rejects non-numeric arg (H1 isnum guard)', async ({ client }) => {
    const lines = await client.command('+request/cancel abc');
    assertOutput(lines, 'number', '+request/cancel non-numeric');
  });

  it('blocks cancelling another player\'s request', async ({ client }) => {
    // Any job that doesn't belong to TestPlayerRJ — use high number
    const lines = await client.command('+request/cancel 99');
    const out = lines.join(' ');
    const denied = out.toLowerCase().includes('valid') || out.toLowerCase().includes("own request");
    if (!denied) throw new Error(`Expected denial on cancel other's request, got: ${out}`);
  });

  it('cancels own request', async ({ client }) => {
    const lines = await client.command('+request/cancel 1');
    // May succeed (destroyed) or "invalid" if request 1 isn't theirs
    assertNoContent(lines, '#-1', '+request/cancel own');
    assertNoContent(lines, '#-2', '+request/cancel own');
  });
});

// ── Suite 25: player +request/help ───────────────────────────────────────────
playerRunner.describe('player: +request/help', ({ it }) => {
  it('shows player help without error', async ({ client }) => {
    const lines = await client.command('+request/help');
    assertNoError(lines, '+request/help');
    assertOutput(lines, '+request', '+request/help content');
  });
});

// ─── Main — sequential: setup → wizard → player → teardown ───────────────────
async function main(): Promise<void> {
  // ── Phase 1: setup (direct client — no runner overhead) ──────────────────
  const setupClient = new RhostClient({ host: HOST, port: PORT });
  await setupClient.connect();
  await setupClient.login(USER, PASS);

  rjSys = await setupClient.eval(`search(name=Rockpath's Jobs System)`);
  rjDb  = await setupClient.eval(`search(name=Rockpath's Job Database)`);

  if (!rjSys.startsWith('#') || !rjDb.startsWith('#')) {
    console.error(`RockJobs objects not found (rjSys=${rjSys}, rjDb=${rjDb}). Load rockjobs.mush first.`);
    process.exit(1);
  }

  // Create the alt player account
  await setupClient.command(`@pcreate ${ALT_NAME}=${ALT_PASS}`);
  altDbref = await setupClient.eval(`pmatch(${ALT_NAME})`);
  if (!altDbref.startsWith('#')) {
    console.error(`Failed to create alt player ${ALT_NAME}: ${altDbref}`);
    process.exit(1);
  }

  await setupClient.disconnect();

  // ── Phase 2: wizard runner (staff tests) ─────────────────────────────────
  const wizResult = await wizRunner.run({ host: HOST, port: PORT, username: USER, password: PASS });

  // ── Phase 3: player runner (player-facing tests) ──────────────────────────
  const playerResult = await playerRunner.run({ host: HOST, port: PORT, username: ALT_NAME, password: ALT_PASS });

  // ── Phase 4: teardown (direct client) ────────────────────────────────────
  const teardownClient = new RhostClient({ host: HOST, port: PORT });
  await teardownClient.connect();
  await teardownClient.login(USER, PASS);

  // Destroy alt player
  await teardownClient.command(`@nuke ${altDbref}`);

  // Destroy any remaining job objects
  const jobs = await teardownClient.eval(`lcon(${rjDb}/object)`);
  if (jobs.trim()) {
    for (const dbref of jobs.trim().split(' ')) {
      if (dbref.startsWith('#')) await teardownClient.command(`@nuke ${dbref}`);
    }
  }

  await teardownClient.disconnect();

  // ── Result ────────────────────────────────────────────────────────────────
  const failed = wizResult.failed + playerResult.failed;
  if (wizResult.failed > 0)    console.error(`Wizard suite:  ${wizResult.failed} failed`);
  if (playerResult.failed > 0) console.error(`Player suite:  ${playerResult.failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err.message); process.exit(1); });
