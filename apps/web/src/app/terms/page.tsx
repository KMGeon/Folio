import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "이용약관 · Folio",
  description: "Folio 서비스 이용약관",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "서비스 정의",
    blocks: [
      {
        type: "p",
        text: "Folio(이하 “서비스”)는 GitHub Pull Request를 논리적인 리뷰 챕터로 분해하여 코드 리뷰를 돕는 웹 서비스입니다. 본 약관은 서비스 이용에 관한 회사와 이용자 간의 권리·의무 및 책임사항을 규정합니다.",
      },
    ],
  },
  {
    heading: "계정 및 자격",
    blocks: [
      {
        type: "p",
        text: "서비스 이용을 위해서는 유효한 GitHub 계정으로 로그인해야 합니다. 이용자는 자신의 계정으로 발생하는 모든 활동에 대한 책임을 집니다.",
      },
      {
        type: "ul",
        items: [
          "만 14세 이상이거나 거주 지역의 법정 연령 이상이어야 합니다.",
          "타인의 계정을 무단으로 사용하거나 권한을 위임받지 않은 저장소에 접근해서는 안 됩니다.",
        ],
      },
    ],
  },
  {
    heading: "허용 및 금지 행위",
    blocks: [
      {
        type: "p",
        text: "이용자는 관련 법령과 본 약관을 준수하여 서비스를 이용해야 하며, 다음 행위를 해서는 안 됩니다.",
      },
      {
        type: "ul",
        items: [
          "서비스의 정상적인 운영을 방해하거나 비정상적인 방법으로 접근·역공학을 시도하는 행위",
          "권한이 없는 저장소, 데이터, 다른 이용자의 정보에 접근하려는 행위",
          "관련 법령 또는 제3자의 권리를 침해하는 콘텐츠를 처리하는 행위",
        ],
      },
    ],
  },
  {
    heading: "GitHub 연동",
    blocks: [
      {
        type: "p",
        text: "서비스는 사용자 로그인을 위해 GitHub OAuth를, 저장소 데이터 접근을 위해 GitHub App 설치 권한을 사용합니다. 두 권한은 분리되어 있으며, 저장소 접근 범위는 이용자가 GitHub App을 설치한 범위로 한정됩니다. 이용자는 GitHub 설정에서 언제든 권한을 철회할 수 있습니다.",
      },
    ],
  },
  {
    heading: "지적재산권",
    blocks: [
      {
        type: "p",
        text: "서비스 및 그에 포함된 모든 소프트웨어·디자인·상표에 대한 권리는 회사 또는 정당한 권리자에게 있습니다. 이용자가 서비스를 통해 처리하는 코드 및 콘텐츠에 대한 권리는 이용자 또는 원 권리자에게 유보됩니다.",
      },
    ],
  },
  {
    heading: "보증의 부인 및 책임 제한",
    blocks: [
      {
        type: "p",
        text: "서비스는 “있는 그대로(as-is)” 제공되며, 회사는 서비스가 중단 없이 오류 없이 제공된다거나 특정 목적에 적합하다는 것을 보증하지 않습니다.",
      },
      {
        type: "p",
        text: "관련 법령이 허용하는 범위에서, 회사는 서비스 이용으로 발생한 간접·부수·특별·결과적 손해에 대해 책임을 지지 않습니다. 자동 생성된 리뷰 챕터는 보조 도구이며, 코드 변경의 최종 검토 책임은 이용자에게 있습니다.",
      },
    ],
  },
  {
    heading: "약관의 변경",
    blocks: [
      {
        type: "p",
        text: "회사는 필요한 경우 본 약관을 변경할 수 있으며, 변경 시 서비스 내 공지 또는 본 페이지를 통해 고지합니다. 변경 이후 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로 봅니다.",
      },
    ],
  },
  {
    heading: "문의",
    blocks: [
      {
        type: "p",
        text: "본 약관에 관한 문의는 support.foliodev@gmail.com 으로 연락해 주시기 바랍니다.",
      },
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="이용약관"
      effectiveDate="2026-06-21"
      intro="본 약관은 Folio 서비스 이용에 적용됩니다. 서비스에 로그인하거나 이를 이용함으로써 본 약관에 동의하게 됩니다."
      sections={SECTIONS}
    />
  );
}
