# 同attempt status-only終端・typed cleanupとstatus binding：連続fake検証

Date: 2026-10-31。対象：[差分設計§12](BEST_PRACTICE_ABORT_SCOPE_STATUS_SESSION_BINDING_DELTA_DESIGN.md)。実session／実transportへの接続ではない。

## 1 実装と境界

- 開発専用moduleが新規fake core／lifecycle／status binding／ST-03C ownerを一緒に生成。既存private生成・accounting契約を再利用し、外部session・binding・証拠・cleanup診断の採用口を持たない。
- 同ownerのResponse acquire→同reader cancel-only cleanup→private issue／one-shot consume→binding post-guardへ接続。opaque handle／terminalは返却しない。
- canonical停止はnative claimを同期失効。後始末のreadonly時計観測は継続できるが、停止後の消費成功は認めない。
- 模擬dispatch C=1、reader.read=0／G=P=0。実dispatch・URL／認証bindingの証明にはしない。
- HTTP／cleanup／binding診断と成功履歴を別々に保持し、再runは拒否理由を追加して履歴を保持。全7権限false、fallback／正式発行はdisabled。

## 2 合成条件

期待値は固定purpose／status／body有無の表と独立した操作数・C/G/Pから作り、製品分類器を期待値として流用しない。

- release403／404：同readerでgetReader／cancel／closed／releaseLock各1、read0、consume1。no_bodyは全操作0・not_applicableでEOFではない。
- hard401／parent403とparent404：候補消費0。HTTP事実をcleanup成功／失敗と分離。
- cancel拒否・pending timeout・late settle：unconfirmedを保持し、消費・fallbackは0。
- cleanup中／issue／consume pre／postの取消：同core停止とnative失効、同cleanupへのclose合流・一度解放。
- 元floorへの到達、開始前の期限0／取消、再run／再入：追加C・消費なし。最初の理由を保持。
- 外部診断・既に所有したResponse・constructorへのsession／binding／registry等の混入、accessor／proxy：採用不可。
- 本文・例外marker非出力、global fetch呼出し0、module・fixtureの非同梱。

## 3 検証結果

初回の専用23テストとbuildは成功。混入／開始前停止の負の対照を追加し、最終結果を以下へ記録する。

- 全体`npm test`：205ファイル・9,262テスト成功。専用27テストを含む。終了join pointの最終調整後も同件数で再実行成功。期限・受信量・件数上限の緩和なし。
- `npm run build`：成功。
- 新source／専用testのESLint：成功。
- `node tests/review/package-http-classification.mjs`：compiled分類3,000組と既存ST各段階に加え、新規bound workflow compiled fixtureが成功。pack dry-runはoffline・ignore-scripts、対象module／fixture非同梱と配布runtimeからの非参照を確認（409ファイル）。依存インストール・ネットワーク通信なし。
- 文書参照先と差分の空白検査を確認。

依存再取得を伴うpackage-workerテストは[前工程の環境制約](E2E_BEST_PRACTICE_STATUS_CONSTRUCTOR_BINDING_2026-10-31.md)を継承し、再実行しない。

## 4 未実施・残課題

runtime status issuer／実session採用、固定dispatcherの実URL・認証snapshot結合、固定sourceの非200受理、fallback有効化、正式receipt／payload／worker・最終予約移譲は未実施。合成消費履歴から権限を復元する設計を採らない。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行っていない。
