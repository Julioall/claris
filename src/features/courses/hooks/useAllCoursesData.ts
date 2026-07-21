import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';

import {
  setCourseAttendanceEnabled,
  setCourseAssociationRole,
  setCoursesIgnored,
} from '../api/courses-catalog';
import { courseKeys } from '../query-keys';
import type { CourseWithStats } from '../types';
import { useCoursesCatalogQuery } from './useCoursesCatalogQuery';

function updateCatalogCourses(
  current: CourseWithStats[] | undefined,
  updater: (courses: CourseWithStats[]) => CourseWithStats[],
) {
  return updater(current ?? []);
}

function invalidateCourseScopeQueries(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['students', userId ?? 'anonymous'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard', userId ?? 'anonymous'] });
}

export function useAllCoursesData() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useCoursesCatalogQuery(user?.id);
  const courses = query.data ?? [];

  const toggleFollowMutation = useMutation({
    mutationFn: async ({ courseId, nextFollowing }: { courseId: string; nextFollowing: boolean }) => {
      await setCourseAssociationRole([courseId], nextFollowing ? 'tutor' : 'viewer');
      return { courseId, nextFollowing };
    },
    onSuccess: ({ courseId, nextFollowing }) => {
      queryClient.setQueryData<CourseWithStats[]>(
        courseKeys.catalog(user?.id),
        (current) => updateCatalogCourses(current, (items) =>
          items.map((course) =>
            course.id === courseId ? { ...course, is_following: nextFollowing } : course,
          )),
      );
      invalidateCourseScopeQueries(queryClient, user?.id);
    },
  });

  const toggleIgnoreMutation = useMutation({
    mutationFn: async ({ courseId, nextIgnored }: { courseId: string; nextIgnored: boolean }) => {
      await setCoursesIgnored([courseId], nextIgnored);

      return { courseId, nextIgnored };
    },
    onSuccess: ({ courseId, nextIgnored }) => {
      queryClient.setQueryData<CourseWithStats[]>(
        courseKeys.catalog(user?.id),
        (current) => updateCatalogCourses(current, (items) =>
          items.map((course) =>
            course.id === courseId ? { ...course, is_ignored: nextIgnored } : course,
          )),
      );
    },
  });

  const toggleIgnoreMultipleMutation = useMutation({
    mutationFn: async ({
      courseIds,
      shouldIgnore,
      existingIgnoredIds,
    }: {
      courseIds: string[];
      shouldIgnore: boolean;
      existingIgnoredIds: string[];
    }) => {
      if (shouldIgnore) {
        const courseIdsToIgnore = courseIds.filter((courseId) => !existingIgnoredIds.includes(courseId));
        if (courseIdsToIgnore.length > 0) {
          await setCoursesIgnored(courseIdsToIgnore, true);
        }
      } else {
        await setCoursesIgnored(courseIds, false);
      }

      return { courseIds, shouldIgnore };
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.catalog(user?.id) });
    },
    onSuccess: ({ courseIds, shouldIgnore }) => {
      queryClient.setQueryData<CourseWithStats[]>(
        courseKeys.catalog(user?.id),
        (current) => updateCatalogCourses(current, (items) =>
          items.map((course) =>
            courseIds.includes(course.id) ? { ...course, is_ignored: shouldIgnore } : course,
          )),
      );
    },
  });

  const unfollowMultipleMutation = useMutation({
    mutationFn: async (courseIds: string[]) => {
      await setCourseAssociationRole(courseIds, 'viewer');
      return courseIds;
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.catalog(user?.id) });
    },
    onSuccess: (courseIds) => {
      queryClient.setQueryData<CourseWithStats[]>(
        courseKeys.catalog(user?.id),
        (current) => updateCatalogCourses(current, (items) =>
          items.map((course) =>
            courseIds.includes(course.id) ? { ...course, is_following: false } : course,
          )),
      );
      invalidateCourseScopeQueries(queryClient, user?.id);
    },
  });

  const toggleAttendanceMutation = useMutation({
    mutationFn: async ({ courseId, shouldEnable }: { courseId: string; shouldEnable: boolean }) => {
      await setCourseAttendanceEnabled([courseId], shouldEnable);

      return { courseId, shouldEnable };
    },
    onSuccess: ({ courseId, shouldEnable }) => {
      queryClient.setQueryData<CourseWithStats[]>(
        courseKeys.catalog(user?.id),
        (current) => updateCatalogCourses(current, (items) =>
          items.map((course) =>
            course.id === courseId
              ? { ...course, is_attendance_enabled: shouldEnable }
              : course,
          )),
      );
      queryClient.setQueryData(courseKeys.attendance(user?.id, courseId), shouldEnable);
    },
  });

  const toggleAttendanceMultipleMutation = useMutation({
    mutationFn: async ({
      courseIds,
      shouldEnable,
      existingEnabledIds,
    }: {
      courseIds: string[];
      shouldEnable: boolean;
      existingEnabledIds: string[];
    }) => {
      if (shouldEnable) {
        const courseIdsToEnable = courseIds.filter((courseId) => !existingEnabledIds.includes(courseId));
        if (courseIdsToEnable.length > 0) {
          await setCourseAttendanceEnabled(courseIdsToEnable, true);
        }
      } else {
        await setCourseAttendanceEnabled(courseIds, false);
      }

      return { courseIds, shouldEnable };
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.catalog(user?.id) });
    },
    onSuccess: ({ courseIds, shouldEnable }) => {
      queryClient.setQueryData<CourseWithStats[]>(
        courseKeys.catalog(user?.id),
        (current) => updateCatalogCourses(current, (items) =>
          items.map((course) =>
            courseIds.includes(course.id)
              ? { ...course, is_attendance_enabled: shouldEnable }
              : course,
          )),
      );
      courseIds.forEach((courseId) => {
        queryClient.setQueryData(courseKeys.attendance(user?.id, courseId), shouldEnable);
      });
    },
  });

  return {
    courses,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    toggleFollow: async (courseId: string) => {
      const course = courses.find((entry) => entry.id === courseId);
      if (!user || !course) return;

      await toggleFollowMutation.mutateAsync({
        courseId,
        nextFollowing: !course.is_following,
      });
    },
    toggleIgnore: async (courseId: string) => {
      const course = courses.find((entry) => entry.id === courseId);
      if (!user || !course) return;

      await toggleIgnoreMutation.mutateAsync({
        courseId,
        nextIgnored: !course.is_ignored,
      });
    },
    toggleIgnoreMultiple: async (courseIds: string[], shouldIgnore: boolean) => {
      if (!user || courseIds.length === 0) return;

      const existingIgnoredIds = courses
        .filter((course) => courseIds.includes(course.id) && course.is_ignored)
        .map((course) => course.id);

      await toggleIgnoreMultipleMutation.mutateAsync({
        courseIds,
        shouldIgnore,
        existingIgnoredIds,
      });
    },
    unfollowMultiple: async (courseIds: string[]) => {
      if (!user || courseIds.length === 0) return;
      await unfollowMultipleMutation.mutateAsync(courseIds);
    },
    toggleAttendance: async (courseId: string) => {
      const course = courses.find((entry) => entry.id === courseId);
      if (!user || !course) return;

      await toggleAttendanceMutation.mutateAsync({
        courseId,
        shouldEnable: !course.is_attendance_enabled,
      });
    },
    toggleAttendanceMultiple: async (courseIds: string[], shouldEnable: boolean) => {
      if (!user || courseIds.length === 0) return;

      const existingEnabledIds = courses
        .filter((course) => courseIds.includes(course.id) && course.is_attendance_enabled)
        .map((course) => course.id);

      await toggleAttendanceMultipleMutation.mutateAsync({
        courseIds,
        shouldEnable,
        existingEnabledIds,
      });
    },
  };
}
