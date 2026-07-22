import { describe, expect, it } from 'vitest';

import { isStudentLikeUser } from '../../../../supabase/functions/_shared/moodle/student-role.ts';

describe('moodle-sync-students role classification', () => {
  it('accepts users with explicit student roles', () => {
    expect(isStudentLikeUser({
      roles: [{ shortname: 'student', name: 'Aluno' }],
    })).toBe(true);
  });

  it('rejects tutors and monitors even when Moodle only sends the role name', () => {
    expect(isStudentLikeUser({
      roles: [{ name: 'Tutor' }],
    })).toBe(false);
    expect(isStudentLikeUser({
      roles: [{ name: 'Monitor' }],
    })).toBe(false);
  });

  it('prioritizes staff roles over student roles when both are present', () => {
    expect(isStudentLikeUser({
      roles: [
        { shortname: 'student', name: 'Aluno' },
        { shortname: 'monitor', name: 'Monitor' },
      ],
    })).toBe(false);
  });

  it('excludes users without role metadata because the identity is ambiguous', () => {
    expect(isStudentLikeUser({ roles: [] })).toBe(false);
    expect(isStudentLikeUser({})).toBe(false);
  });
});
