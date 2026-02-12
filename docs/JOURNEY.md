# OpenClaw-Optimised - Journey Log

## Project Overview
**Repository**: OpenClaw-Optimised  
**Based On**: openclaw/openclaw (v2026.2.9)  
**Goal**: Optimize OpenClaw for cost reduction, security, and scalability  
**Target Budget**: £60/month maximum for API costs  
**Current Status**: Analysis and optimization design phase

## Collaboration Timeline

### 2025-02-12: Project Inception
- **Objective**: Create optimized fork of OpenClaw with focus on:
-   1. Cost reduction (API usage optimization)
    2.   2. Security hardening (SAST/DAST patterns)
         3.   3. Hybrid LLM support (Ollama + Anthropic Claude)
              4.   4. Multi-bot architecture (scalable platform)
                   5.   5. Message optimization (reduce token usage)
                     
                        6. - **Context Established**:
                           -   - Single user (Andy) using Telegram integration
                               -   - Anthropic Claude API causing exponential cost growth
                                   -   - "Forever" conversation history requirement
                                       -   - Mixed media (text + screenshots)
                                           -   - Cost compounding daily due to growing context
                                            
                                               - - **Initial Repository Setup**:
                                                 -   - Created GitHub import from openclaw/openclaw
                                                     -   - Import completed successfully
                                                         -   - Analysis of original codebase completed
                                                             -   - Comprehensive documentation prepared
                                                              
                                                                 - ### Key Discoveries
                                                              
                                                                 - #### Architecture Analysis
                                                                 - **OpenClaw Core Components**:
                                                                 - - **Gateway**: WebSocket-based control plane with sessions, presence, config management, cron scheduling, webhooks, Control UI and Canvas host
                                                                   - - **Multi-Agent Routing**: Routes channels/accounts to isolated agents with workspace + per-agent sessions - perfect foundation for multi-bot architecture
                                                                     - - **Channel Support**: Telegram (grammY), WhatsApp (Baileys), Discord, Slack, Signal, and 10+ others
                                                                       - - **Technology Stack**: Node.js ≥22, TypeScript, pnpm package manager, WebSocket-based communication
                                                                        
                                                                         - #### Critical Cost Problem Identified
                                                                         - **Current State**:
                                                                         - - No conversation history management
                                                                           - - Full context sent on every message
                                                                             - - Exponential token growth over time
                                                                               - - No RAG (Retrieval Augmented Generation)
                                                                                 - - No local LLM fallback
                                                                                   - - No caching strategy
                                                                                     - - Screenshots sent as base64 (massive token cost)
                                                                                      
                                                                                       - **Impact**:
                                                                                       - - Current estimated burn: £200-500+/month (growing)
                                                                                         - - Token usage doubles every few weeks
                                                                                           - - Unsustainable trajectory
                                                                                            
                                                                                             - **Solution Design**:
                                                                                             - - Implement RAG with vector database
                                                                                               - - Add Ollama for local processing
                                                                                                 - - Tiered memory system (hot/recent/archive)
                                                                                                   - - Message compression and deduplication
                                                                                                     - - Intelligent screenshot processing
                                                                                                       - - Hybrid routing (local vs API)
                                                                                                        
                                                                                                         - **Projected Outcome**:
                                                                                                         - - Target: <£60/month
                                                                                                           - - Expected reduction: 80-90%+
                                                                                                             - - Constant costs regardless of history length
                                                                                                              
                                                                                                               - ## Documentation Created
                                                                                                              
                                                                                                               - All comprehensive documentation has been prepared:
                                                                                                              
                                                                                                               - 1. **JOURNEY.md** - This file (project timeline)
                                                                                                                 2. 2. **CURRENT_STATE_ANALYSIS.md** - Architecture analysis
                                                                                                                    3. 3. **COST_CRISIS.md** - Understanding exponential cost growth
                                                                                                                       4. 4. **RAG_IMPLEMENTATION.md** - RAG system design
                                                                                                                          5. 5. **OLLAMA_HYBRID.md** - Hybrid LLM architecture
                                                                                                                             6. 6. **MEMORY_TIERS.md** - Tiered memory system
                                                                                                                                7. 7. **SECURITY_AUDIT.md** - Security vulnerabilities & fixes
                                                                                                                                   8. 8. **MULTI_BOT_ARCHITECTURE.md** - Multi-bot platform design
                                                                                                                                      9. 9. **IMPLEMENTATION_ROADMAP.md** - 8-week execution plan
                                                                                                                                         10. 10. **README.md** - Project overview
                                                                                                                                            
                                                                                                                                             11. ## Next Milestones
                                                                                                                                            
                                                                                                                                             12. ### Phase 1: Single-Bot Optimization (Week 1-2)
                                                                                                                                             13. - [ ] Implement conversation windowing
                                                                                                                                                 - [ ] - [ ] Set up Ollama integration
                                                                                                                                                 - [ ] - [ ] Create vector database (Chroma)
                                                                                                                                                 - [ ] - [ ] Implement RAG retrieval
                                                                                                                                                 - [ ] - [ ] Add message compression
                                                                                                                                                 - [ ] - [ ] Deploy cost monitoring
                                                                                                                                                
                                                                                                                                                 - [ ] **Expected Reduction**: 70-80%
                                                                                                                                                
                                                                                                                                                 - [ ] ### Phase 2: Advanced Optimization (Week 3-4)
                                                                                                                                                 - [ ] - [ ] Hybrid LLM routing
                                                                                                                                                 - [ ] - [ ] Screenshot optimization with Ollama Vision
                                                                                                                                                 - [ ] - [ ] Tiered memory system
                                                                                                                                                 - [ ] - [ ] Automatic summarization
                                                                                                                                                 - [ ] - [ ] Performance tuning
                                                                                                                                                
                                                                                                                                                 - [ ] **Expected Additional Reduction**: 15-20%
                                                                                                                                                
                                                                                                                                                 - [ ] ### Phase 3: Multi-Bot Platform (Week 5-8)
                                                                                                                                                 - [ ] - [ ] Orchestration layer
                                                                                                                                                 - [ ] - [ ] Bot-to-bot communication protocol
                                                                                                                                                 - [ ] - [ ] Shared resource management
                                                                                                                                                 - [ ] - [ ] Per-bot cost allocation
                                                                                                                                                 - [ ] - [ ] Horizontal scaling architecture
                                                                                                                                                
                                                                                                                                                 - [ ] **Outcome**: Scalable multi-tenant platform
                                                                                                                                                
                                                                                                                                                 - [ ] ## Design Decisions
                                                                                                                                                
                                                                                                                                                 - [ ] ### ADR-001: Use RAG Instead of Full History
                                                                                                                                                 - [ ] **Decision**: Implement Retrieval Augmented Generation
                                                                                                                                                 - [ ] **Rationale**: Sending full conversation history is unsustainable
                                                                                                                                                 - [ ] **Impact**: 70-80% cost reduction
                                                                                                                                                 - [ ] **Trade-offs**: Slight complexity increase, 100ms latency
                                                                                                                                                 - [ ] **Status**: Approved
                                                                                                                                                
                                                                                                                                                 - [ ] ### ADR-002: Hybrid Ollama + Anthropic Architecture
                                                                                                                                                 - [ ] **Decision**: Use Ollama for simple tasks, Claude for complex reasoning
                                                                                                                                                 - [ ] **Rationale**: Free local processing for majority of queries
                                                                                                                                                 - [ ] **Impact**: 40-50% of queries handled free
                                                                                                                                                 - [ ] **Trade-offs**: Need to maintain Ollama instance
                                                                                                                                                 - [ ] **Status**: Approved
                                                                                                                                                
                                                                                                                                                 - [ ] ### ADR-003: Tiered Memory System
                                                                                                                                                 - [ ] **Decision**: Implement 4-tier memory (hot/recent/medium/archive)
                                                                                                                                                 - [ ] **Rationale**: Balance speed, cost, and "forever" history requirement
                                                                                                                                                 - [ ] **Impact**: Constant token usage regardless of history age
                                                                                                                                                 - [ ] **Trade-offs**: More complex memory management
                                                                                                                                                 - [ ] **Status**: Approved
                                                                                                                                                
                                                                                                                                                 - [ ] ## Resources & References
                                                                                                                                                 - [ ] - [OpenClaw Repository](https://github.com/openclaw/openclaw)
                                                                                                                                                 - [ ] - [OpenClaw Documentation](https://openclaw.ai)
                                                                                                                                                 - [ ] - [Anthropic API Pricing](https://www.anthropic.com/pricing)
                                                                                                                                                 - [ ] - [Ollama Documentation](https://ollama.ai)
                                                                                                                                                 - [ ] - [Chroma Vector Database](https://www.trychroma.com/)
                                                                                                                                                
                                                                                                                                                 - [ ] ---
                                                                                                                                                 - [ ] *Last Updated: 2025-02-12*
                                                                                                                                                 - [ ] *Next Review: After Phase 1 implementation*
