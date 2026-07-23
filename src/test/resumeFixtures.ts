/* 테스트용 이력서 샘플 — 이력서 도메인이 실제 API로 전환되며 fixtures.ts에서 이곳으로 이동.
   fetchResumes 목킹의 반환값으로 사용한다 (UI 모델 Resume 형태). */
import type { Resume } from "../api/types";

export const resumes: Resume[] = [
  {
    id: 1,
    name: "백엔드_개발자_이력서.pdf",
    ext: "PDF",
    meta: "2.4MB · 2일 전",
    uploadedAt: "2026.06.01",
    status: "done",
  },
  {
    id: 2,
    name: "경력기술서_2026.pdf",
    ext: "PDF",
    meta: "3.0MB · 6일 전",
    uploadedAt: "2026.05.20",
    status: "done",
  },
  {
    id: 3,
    name: "신입_포트폴리오.pdf",
    ext: "PDF",
    meta: "5.1MB · 방금 전",
    uploadedAt: "2026.06.05",
    status: "ing",
    progress: 62,
  },
  {
    id: 4,
    name: "이력서_v1.docx",
    ext: "DOC",
    meta: "1.2MB · 6일 전",
    uploadedAt: "2026.05.18",
    status: "fail",
  },
];
