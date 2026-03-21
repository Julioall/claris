import { useState } from 'react';
import { Bug, ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useMoodleSession } from '@/modules/auth/context/MoodleSessionContext';

interface CourseOption {
  id: string;
  name: string;
  moodle_course_id: string;
}

interface StudentOption {
  id: string;
  full_name: string;
  moodle_user_id: string;
}

export function GradeDebugCard() {
  const moodleSession = useMoodleSession();
  const [isOpen, setIsOpen] = useState(false);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [debugResponse, setDebugResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    if (courses.length > 0) return;
    
    const { data } = await supabase
      .from('courses')
      .select('id, name, moodle_course_id')
      .order('name');
    
    if (data) {
      setCourses(data);
    }
  };

  const loadStudents = async (courseId: string) => {
    const { data: course } = await supabase
      .from('courses')
      .select('id')
      .eq('moodle_course_id', courseId)
      .single();
    
    if (!course) return;

    const { data } = await supabase
      .from('student_courses')
      .select('students!inner(id, full_name, moodle_user_id)')
      .eq('course_id', course.id)
      .limit(20);
    
    if (data) {
      const studentList = data.map((sc: { students: { id: string; full_name: string; moodle_user_id: string } }) => ({
        id: sc.students.id,
        full_name: sc.students.full_name,
        moodle_user_id: sc.students.moodle_user_id,
      }));
      setStudents(studentList);
    }
  };

  const handleCourseChange = (courseId: string) => {
    setSelectedCourse(courseId);
    setSelectedStudent('');
    setDebugResponse(null);
    setError(null);
    loadStudents(courseId);
  };

  const fetchGradeDebug = async () => {
    if (!selectedCourse || !selectedStudent || !moodleSession) return;

    setIsLoading(true);
    setDebugResponse(null);
    setError(null);

    try {
      const student = students.find(s => s.id === selectedStudent);
      if (!student) throw new Error('Aluno não encontrado');

      const { data, error: invokeError } = await supabase.functions.invoke('moodle-sync-grades', {
        body: {
          action: 'debug_grades',
          moodleUrl: moodleSession.moodleUrl,
          token: moodleSession.moodleToken,
          courseId: parseInt(selectedCourse, 10),
          userId: parseInt(student.moodle_user_id, 10),
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      setDebugResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar notas');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="cursor-pointer" onClick={() => { setIsOpen(!isOpen); loadCourses(); }}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bug className="h-5 w-5" />
                  Debug de Notas (API Moodle)
                </CardTitle>
                <CardDescription>
                  Visualize a resposta bruta da API de notas do Moodle
                </CardDescription>
              </div>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Curso</label>
                <Select value={selectedCourse} onValueChange={handleCourseChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um curso" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.moodle_course_id}>
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Aluno</label>
                <Select 
                  value={selectedStudent} 
                  onValueChange={setSelectedStudent}
                  disabled={!selectedCourse}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um aluno" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={fetchGradeDebug} 
              disabled={!selectedCourse || !selectedStudent || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" onAccent />
                  Buscando...
                </>
              ) : (
                <>
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Buscar Notas (API Raw)
                </>
              )}
            </Button>

            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            {debugResponse && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Resposta da API:</h4>
                <ScrollArea className="h-[400px] w-full rounded-md border bg-muted/50 p-4">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {JSON.stringify(debugResponse, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
