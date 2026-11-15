import { describe, expect, it } from 'vitest';

import { newLesson } from '../package';
import { missingSentence, missingSubjects, parseStandard, parseStandardList, requiredSubjects, standardCode, standardLabel, STRANDS, strandsFor, subjectCoverage } from '../standards';
import type { Curriculum, RhythmBlock } from '../types';

const strand = (code: string) => STRANDS.find((s) => s.code === code)!;
const cur = (p: Partial<Curriculum>): Curriculum => ({
  id: 'c', name: 'Plan', subject: 'math', childIds: ['k'], totalLessons: 1, lessonsDone: 0, startDate: '2026-08-17', targetEndDate: '2027-05-28', schoolDays: [1], model: 'modular', ...p,
});
const block = (subject: RhythmBlock['subject'], title: string): RhythmBlock => ({ id: title, title, subject, childIds: ['k'], mode: 'solo', start: '09:00', durationMin: 30, days: [1], icon: '', steps: [] });

describe('standards tags', () => {
  it('builds and reads Common Core codes', () => {
    expect(standardCode(strand('NF'), 4)).toBe('CCSS.MATH.CONTENT.4.NF');
    expect(standardCode(strand('NF'), 1)).toBe('CCSS.MATH.CONTENT.3.NF'); // clamped to the strand's grades
    expect(standardCode(strand('RL'), 0)).toBe('CCSS.ELA-LITERACY.RL.K');
    expect(parseStandard('CCSS.MATH.CONTENT.3.NF')?.strand.subject).toBe('math');
    expect(parseStandard('3.nf.a.1')?.grade).toBe('3');
    expect(parseStandard('W.5.2')?.strand.subject).toBe('writing');
    expect(parseStandard('TEKS 3.4A')).toBeUndefined();
    expect(standardLabel('CCSS.ELA-LITERACY.RI.2')).toBe('ELA RI.2 · Reading: Informational Text');
    expect(standardLabel(' TEKS 3.4A ')).toBe('TEKS 3.4A');
    expect(parseStandardList('3.NF, TEKS 3.4A; 3.nf\nW.3.1')).toEqual(['3.NF', 'TEKS 3.4A', 'W.3.1']);
  });

  it('offers strands that fit the subjects and grades', () => {
    expect(strandsFor(['math'], 6, 8).map((s) => s.code)).toEqual(['G', 'RP', 'NS', 'EE', 'F', 'SP']);
    expect(strandsFor(['science'], 1, 3)).toEqual([]);
    expect(strandsFor(['reading'], 7, 8).map((s) => s.code)).toEqual(['RL', 'RI', 'W', 'SL', 'L']);
  });
});

describe('subject coverage', () => {
  const outline = [{ id: 'u', title: 'U', lessons: [{ ...newLesson('Story problems'), standards: ['CCSS.MATH.CONTENT.3.OA', 'W.3.2', 'My state 3.1'] }] }];
  const coverage = subjectCoverage([cur({ name: 'Math Mammoth', outline }), cur({ id: 'c2', name: 'Pond Life', subject: 'science' })], [block('history', 'Story of the World'), block('free_play', 'Recess')]);

  it('counts curricula, rhythm blocks, and tagged standards', () => {
    const by = Object.fromEntries(coverage.map((c) => [c.subject, c]));
    expect(by.math.standards).toEqual(['CCSS.MATH.CONTENT.3.OA', 'My state 3.1']);
    expect(by.writing).toMatchObject({ sources: ['Math Mammoth'], standards: ['W.3.2'] });
    expect(by.history.sources).toEqual(['Story of the World']);
    expect(by.free_play).toBeUndefined();
  });

  it('flags subjects the state lists that the plan is missing', () => {
    expect(requiredSubjects('AZ').map((r) => r.label)).toEqual(['Reading', 'Spelling & grammar', 'Math', 'Social studies', 'Science']);
    // Writing (from the tagged standard) covers spelling & grammar; history covers social studies.
    const missing = missingSubjects('AZ', coverage);
    expect(missing.map((m) => m.label)).toEqual(['Reading']);
    expect(missingSentence('AZ', missing)).toBe('Arizona asks for Reading, and nothing in your plan covers it yet.');
    expect(missingSubjects('AK', coverage)).toEqual([]); // no list for this state
    expect(missingSentence('TX', missingSubjects('TX', []))).toMatch(/^Texas asks for Reading, Spelling & grammar, Math and Civics & citizenship/);
  });
});
