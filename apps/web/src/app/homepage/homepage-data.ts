import {
  BookOpen,
  GitPullRequest,
  Github,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  Split,
} from "lucide-react";

export const reviewFlow = [
  {
    title: "PR 컨텍스트 수집",
    scope: "GitHub App · diff · metadata",
    icon: GitPullRequest,
  },
  {
    title: "리뷰 챕터 생성",
    scope: "logical order · risk · files",
    icon: Layers3,
  },
  {
    title: "챕터별 검토",
    scope: "focused reading · comments",
    icon: MessageSquareText,
  },
];

export const proofPoints = [
  "큰 PR을 리뷰 가능한 장으로 나눕니다.",
  "GitHub App 데이터만 사용합니다.",
  "리뷰 진행 상태를 팀 기준으로 맞춥니다.",
];

export const features = [
  {
    title: "챕터 기반 리뷰",
    body: "파일 나열이 아니라 변경 의도와 검토 순서를 기준으로 PR을 재구성합니다.",
    icon: BookOpen,
  },
  {
    title: "GitHub-native 흐름",
    body: "설치, webhook, OAuth, PR comment가 GitHub 안에서 자연스럽게 이어집니다.",
    icon: Github,
  },
  {
    title: "코드 저장 최소화",
    body: "Folio는 로컬 머신을 만지지 않고 GitHub 데이터로 리뷰 화면을 구성합니다.",
    icon: LockKeyhole,
  },
];

export const chapterRows = [
  {
    chapter: "01",
    title: "세션 스키마 & repo 토큰",
    files: "db, migrations",
    add: 142,
    del: 8,
    status: "ready",
  },
  {
    chapter: "02",
    title: "GitHub OAuth 어댑터",
    files: "infrastructure/github",
    add: 96,
    del: 21,
    status: "review",
  },
  {
    chapter: "03",
    title: "세션 도메인 서비스",
    files: "domain/auth",
    add: 73,
    del: 4,
    status: "ready",
  },
  {
    chapter: "04",
    title: "Facade & route guard",
    files: "interfaces/api/auth",
    add: 118,
    del: 33,
    status: "risk",
  },
];

export const codeLines = [
  "+ export class GithubAuthFacade",
  "+ await this.sessions.issueOAuthState()",
  "- localStorage.setItem('github_token')",
  "+ return response.created(session)",
];

export const pipelineColumns = [
  {
    label: "GitHub PR",
    detail: "#1284 · 19 files",
    icon: GitPullRequest,
  },
  {
    label: "Chapter Engine",
    detail: "4 logical chapters",
    icon: Split,
  },
  {
    label: "Reviewer View",
    detail: "~9 min read",
    icon: BookOpen,
  },
];

export const pricingPlans = [
  {
    name: "Starter",
    note: "오픈소스와 공개 프로젝트를 위한 시작 플랜",
    price: "Free",
    detail: "public repositories",
    action: "오픈베타로 시작하기",
    featured: false,
    items: ["공개 저장소 무제한", "PR 챕터 요약", "리뷰어 대시보드", "위험도 표시"],
  },
  {
    name: "Team",
    note: "빠르게 출시하는 제품팀을 위한 표준 플랜",
    price: "$30",
    detail: "per user / month",
    action: "팀 플랜 알림 받기",
    featured: true,
    items: ["Starter의 모든 기능", "비공개 저장소 무제한", "GitHub 조직 동기화", "팀 리뷰 설정"],
  },
  {
    name: "Enterprise",
    note: "보안과 지원이 필요한 조직을 위한 플랜",
    price: "Custom",
    detail: "custom contract",
    action: "문의하기",
    featured: false,
    items: ["Team의 모든 기능", "SAML SSO", "역할 기반 접근 제어", "감사 로그", "전담 온보딩"],
  },
];
