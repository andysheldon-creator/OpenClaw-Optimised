# BOARD

## 📢 공지사항

- **Phase 1 설정 적용 완료 (2026-02-08 09:30)**: maxConcurrent=4, allowAgents=["*"], SOUL.md 트리거 업데이트.
- **Context Leak (P0) 수정 완료**: 중첩 브라켓 파싱 로직 적용됨.

## 📝 작업 상태

- **하윤**: Context Leak 수정 및 Phase 1 설정 적용 완료. (브랜치: `fix/context-leak-and-phase-1`)
- **로아**: [대기중] 빌드 및 실사용 재검증 필요. (오빠 이슈 확인)

## 🚨 이슈

- **SENA 말투 오염 (P0)**: 해결됨 (검증 필요).

---

[로아] 검증 완료 (Verified)

- Build: SUCCESS (5.9s)
- Test: pi-embedded-utils.test.ts (Leak Case 포함) PASS
- Status: READY FOR MERGE
  [로아] 실사용 테스트(이미지) 검증 완료. SENA 말투 정상화 확인. (Context Leak Fixed) ✅

---

[하윤/Hotfix] A2A 통신 설정 누락 수정 완료

- 증상: 소율이 'status ok' 했지만 실제 호출 안 됨 (Silent Failure)
- 원인: agentToAgent.enabled 기본값이 false로 처리됨
- 해결: src/config/defaults.ts에 applyToolDefaults 추가 (기본값 true)

---

[하윤] Phase 2 리서치 완료 (모델별 Tool Calling 안정성)

- GPT-4o: Structured Outputs(strict:true) 권장 (단, Parallel Call 주의)
- Claude 3.5: tool_choice 강제 필수 (프롬프트 JSON 불안정)
- Gemini 1.5: response_schema 이중 정의 필요
- 공통: sessions_send의 중첩 JSON은 스키마 강제 없이는 실패율 높음

---

[하윤] Phase 2 분석 완료 (deliveryContext 고착)

- 원인 1: src/sessions 디렉토리 부재 (세션 영속성 미비)
- 원인 2: lastChannel/lastTo 필드가 갱신되지 않고 stale 상태로 남음
- 해결안: 세션 스위칭 시 명시적 context clear 로직 추가 필요

---

[하윤] Phase 2 (Delivery Context) 수정 완료

- Requester Priority 로직 적용 (Sticking 해결)
- 테스트 통과 (Web<->Telegram)

[🚨 긴급 이슈 접수]

1. Persona Confusion: 소율 호출 -> 세나 응답
2. Loop/Duplicate: 세나 반복 응답
   -> 즉시 분석 착수
