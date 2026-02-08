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
