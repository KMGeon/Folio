import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "개인정보 처리방침 · Folio",
  description: "Folio 개인정보 처리방침",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "수집하는 정보",
    blocks: [
      {
        type: "p",
        text: "Folio는 서비스 제공에 필요한 최소한의 정보만 수집합니다.",
      },
      {
        type: "ul",
        items: [
          "GitHub 계정 정보: 사용자 식별자, 사용자명, 프로필 이미지, 공개 이메일(GitHub가 제공하는 경우)",
          "리뷰 진행 상태: 이용자가 확인한 챕터·파일 등 진행 상황 데이터",
          "서비스 운영 로그: 접속 및 오류 진단을 위한 기술 로그",
        ],
      },
    ],
  },
  {
    heading: "코드 및 저장소 데이터",
    blocks: [
      {
        type: "p",
        text: "저장소 콘텐츠(코드, diff 등)는 리뷰 챕터를 생성하기 위해 GitHub App 권한 범위 내에서 처리됩니다. Folio는 리뷰 결과 제공에 필요한 범위를 넘어서 저장소 코드를 영구 저장하지 않습니다.",
      },
    ],
  },
  {
    heading: "이용 목적",
    blocks: [
      {
        type: "ul",
        items: [
          "이용자 식별 및 로그인 유지",
          "기기 간 리뷰 진행 상태 동기화",
          "서비스 운영, 오류 진단 및 품질 개선",
        ],
      },
    ],
  },
  {
    heading: "권한 분리",
    blocks: [
      {
        type: "p",
        text: "사용자 식별에는 GitHub OAuth가, 저장소 데이터 접근에는 GitHub App 설치 권한이 사용되며 두 권한은 분리되어 관리됩니다. 이용자는 GitHub 설정에서 언제든 OAuth 인가 또는 App 설치를 철회할 수 있습니다.",
      },
    ],
  },
  {
    heading: "제3자 제공 및 처리 위탁",
    blocks: [
      {
        type: "p",
        text: "Folio는 이용자의 개인정보를 동의 없이 제3자에게 판매하거나 제공하지 않습니다. 다만 서비스 운영을 위해 클라우드 인프라 등 일부 처리를 위탁할 수 있으며, 이 경우 수탁자는 본 방침에 준하는 보호 의무를 부담합니다.",
      },
    ],
  },
  {
    heading: "보관 및 파기",
    blocks: [
      {
        type: "p",
        text: "개인정보는 수집 목적이 달성되거나 이용자가 계정 삭제를 요청하면 관련 법령이 정한 보관 의무가 없는 한 지체 없이 파기합니다.",
      },
    ],
  },
  {
    heading: "이용자의 권리",
    blocks: [
      {
        type: "p",
        text: "이용자는 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있습니다. 요청은 아래 문의처를 통해 접수할 수 있습니다.",
      },
    ],
  },
  {
    heading: "문의",
    blocks: [
      {
        type: "p",
        text: "개인정보 처리에 관한 문의는 support.foliodev@gmail.com 으로 연락해 주시기 바랍니다.",
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="개인정보 처리방침"
      effectiveDate="2026-06-21"
      intro="Folio는 이용자의 개인정보를 소중히 다루며, 어떤 정보를 수집하고 어떻게 이용하는지 투명하게 안내합니다."
      sections={SECTIONS}
    />
  );
}
