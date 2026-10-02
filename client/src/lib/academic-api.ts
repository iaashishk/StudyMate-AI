import api from "./api";
import { Assignment, AssignmentQuestion, LabCode, VivaQuestion } from "../types";

export const academicApi = {
  // ── Assignments ─────────────────────────────────────────────────────────────
  async getAssignments(subjectId?: string): Promise<Assignment[]> {
    const res = await api.get<{ data: { assignments: Assignment[] } }>("/assignments", {
      params: subjectId ? { subjectId } : undefined,
    });
    return res.data.data.assignments;
  },

  async getAssignment(id: string): Promise<Assignment> {
    const res = await api.get<{ data: { assignment: Assignment } }>(`/assignments/${id}`);
    return res.data.data.assignment;
  },

  async createAssignment(data: {
    subjectId: string;
    title: string;
    unitNumber?: number;
    dueDate?: string;
    questions?: Partial<AssignmentQuestion>[];
    rawDocText?: string;
  }): Promise<Assignment> {
    const res = await api.post<{ data: { assignment: Assignment } }>("/assignments", data);
    return res.data.data.assignment;
  },

  async updateAssignment(id: string, data: Partial<Assignment>): Promise<Assignment> {
    const res = await api.patch<{ data: { assignment: Assignment } }>(`/assignments/${id}`, data);
    return res.data.data.assignment;
  },

  async deleteAssignment(id: string): Promise<void> {
    await api.delete(`/assignments/${id}`);
  },

  async addQuestion(
    assignmentId: string,
    data: { question: string; marks?: number; notes?: string; autoSolve?: boolean }
  ): Promise<Assignment> {
    const res = await api.post<{ data: { assignment: Assignment } }>(
      `/assignments/${assignmentId}/questions`,
      data
    );
    return res.data.data.assignment;
  },

  async solveQuestion(assignmentId: string, questionId: string): Promise<{ assignment: Assignment; question: AssignmentQuestion }> {
    const res = await api.post<{ data: { assignment: Assignment; question: AssignmentQuestion } }>(
      `/assignments/${assignmentId}/questions/${questionId}/solve`
    );
    return res.data.data;
  },

  async updateQuestion(
    assignmentId: string,
    questionId: string,
    data: { question?: string; answer?: string; marks?: number; notes?: string }
  ): Promise<{ assignment: Assignment; question: AssignmentQuestion }> {
    const res = await api.put<{ data: { assignment: Assignment; question: AssignmentQuestion } }>(
      `/assignments/${assignmentId}/questions/${questionId}`,
      data
    );
    return res.data.data;
  },

  async solveAllQuestions(assignmentId: string): Promise<Assignment> {
    const res = await api.post<{ data: { assignment: Assignment } }>(
      `/assignments/${assignmentId}/solve-all`
    );
    return res.data.data.assignment;
  },

  async generateQuickAnswer(
    subjectName: string,
    question: string,
    marks = 5
  ): Promise<string> {
    const res = await api.post<{ data: { answer: string } }>(
      "/assignments/generate-quick-answer",
      { subjectName, question, marks }
    );
    return res.data.data.answer;
  },

  // ── Lab Codes & Manual ──────────────────────────────────────────────────────
  async getLabCodes(subjectId?: string): Promise<LabCode[]> {
    const res = await api.get<{ data: { labs: LabCode[] } }>("/labs", {
      params: subjectId ? { subjectId } : undefined,
    });
    return res.data.data.labs;
  },

  async getLabCode(id: string): Promise<LabCode> {
    const res = await api.get<{ data: { lab: LabCode } }>(`/labs/${id}`);
    return res.data.data.lab;
  },

  async createLabCode(data: {
    subjectId: string;
    experimentNumber?: number;
    title: string;
    aim?: string;
    language?: string;
    teacherPrompt?: string;
    code?: string;
    algorithm?: string;
    sampleInput?: string;
    sampleOutput?: string;
    complexity?: { time: string; space: string };
    vivaQuestions?: VivaQuestion[];
    rawDocText?: string;
    autoDerive?: boolean;
  }): Promise<LabCode> {
    const res = await api.post<{ data: { lab: LabCode } }>("/labs", data);
    return res.data.data.lab;
  },

  async updateLabCode(id: string, data: Partial<LabCode>): Promise<LabCode> {
    const res = await api.patch<{ data: { lab: LabCode } }>(`/labs/${id}`, data);
    return res.data.data.lab;
  },

  async deleteLabCode(id: string): Promise<void> {
    await api.delete(`/labs/${id}`);
  },

  async deriveLabCodeWithAI(id: string): Promise<LabCode> {
    const res = await api.post<{ data: { lab: LabCode } }>(`/labs/${id}/derive-ai`);
    return res.data.data.lab;
  },

  async deriveQuickLabCode(data: {
    subjectName?: string;
    title: string;
    aim?: string;
    language?: string;
    teacherPrompt?: string;
  }): Promise<{
    aim: string;
    algorithm: string;
    code: string;
    sampleInput: string;
    sampleOutput: string;
    complexity: { time: string; space: string };
    vivaQuestions: VivaQuestion[];
  }> {
    const res = await api.post<{
      data: {
        solution: {
          aim: string;
          algorithm: string;
          code: string;
          sampleInput: string;
          sampleOutput: string;
          complexity: { time: string; space: string };
          vivaQuestions: VivaQuestion[];
        };
      };
    }>("/labs/derive-quick", data);
    return res.data.data.solution;
  },
};
