import { useState } from 'react';
import { Bug, ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  debugStudentGrades,
  listGradeDebugCourses,
  listGradeDebugStudents,
  type GradeDebugCourseOption,
  type GradeDebugResult,
  type GradeDebugStudentOption,
} from '../api';

export function GradeDebugCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [courses, setCourses] = useState<GradeDebugCourseOption[]>([]);
  const [students, setStudents] = useState<GradeDebugStudentOption[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [debugResponse, setDebugResponse] = useState<GradeDebugResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    if (courses.length > 0) return;

    try {
      setCourses(await listGradeDebugCourses());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar cursos');
    }
  };

  const loadStudents = async (courseId: string) => {
    try {
      setStudents(await listGradeDebugStudents(courseId));
    } catch (err) {
      setStudents([]);
      setError(err instanceof Error ? err.message : 'Erro ao carregar alunos');
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
    if (!selectedCourse || !selectedStudent) return;

    setIsLoading(true);
    setDebugResponse(null);
    setError(null);

    try {
      const data = await debugStudentGrades({
        courseId: selectedCourse,
        studentId: selectedStudent,
      });
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
                  Diagnóstico de Notas do Moodle
                </CardTitle>
                <CardDescription>
                  Execute uma consulta administrativa segura, sem expor credenciais ou payload bruto
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
                      <SelectItem key={course.id} value={course.id}>
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
                        {student.fullName}
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
                  Executar diagnóstico
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
                <h4 className="text-sm font-medium">Resultado normalizado:</h4>
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
