# status binding・同canonical accounting／停止owner：fake接続検証

Date: 2026-10-31。対象：[差分設計§11](BEST_PRACTICE_ABORT_SCOPE_STATUS_SESSION_BINDING_DELTA_DESIGN.md)。実transport／実通信／PDI操作は行わない。

## 1 範囲と発行元

既存sessionのprivate生成継続から、同core・登録済みlease・transport handle・初期source・status bindingを接続する。canonical依存は同constructorが捕捉し、更新portのcopyや別coreを拒否。fixture registryや第二counterは追加しない。既存fake bootstrapのaccountingを同wrapperへ委譲し、公開legacy lane・入力・limitsは変更しない。

stopはcore→ownerとowner→coreの双方で最初の理由を保持して同期失効する。固定stop通知は一度限り。reserveのreleaseはstatus contextだけを失効し、新しいrun primaryを作らない。status-only native処理／正式発行／固定sourceの非200採用は対象外。

## 2 再現した失敗と原因

1. 初回の既存3ファイル87テストでは、final-four容量不足の2件が`request_budget_exceeded`ではなく`closed`となった。accounting wrapperのreleaseがowner全体をrevokeし、通常打切りの局所理由より先にclosedを確定したことが原因。該当2件だけでも再現した。releaseを同context失効だけに変更し、先行理由を保持した。
2. 専用14テストの初回は3件失敗。後続の書込拒否／取消時にも固定stop callbackを再通知していた。再入防止flagだけでは将来の再通知を防げないため、run中一度限りの通知claimへ変更した。以後、関連7ファイル163テスト・build・Lintが成功。

## 3 独立oracleと追加条件

[専用テスト](../tests/review/status-canonical-accounting.test.ts)では、fakeイベント配列の長さとbyte合計を独立計算し、core／leaseのC/Gと比較する。製品counterのcopyを期待値にしない。

- 同coreへの委譲、C/G一度計上、G=0の空chunk、P=0維持。
- copy／外国core／release済みport拒否、二重接続・再入後の再利用拒否。
- 上限超過chunkを一度保持し、後続chunkを拒否して返金しない。
- dispatch前拒否C=0、fake同期throw／reject後はC=1。
- core／owner双方の取消・期限・内部binding理由が同期反映され、通知時点で既に失効済み。
- close／release後もfirst primaryとinternal／public写像を保持。releaseだけでは失敗primaryを新設しない。
- 元clock内での取消・期限0・回復後の再接続拒否、秘密を診断へ出さない。

## 4 最終検証結果

- 全体`npm test`：204ファイル・9,235テスト成功（専用17テスト）。期限・件数・受信量は緩和していない。
- `npm run build`、変更source3ファイル／test2ファイルのESLint：成功。
- `package-http-classification.mjs`：compiled分類3,000組とST-01／02／03A／B／C、開発専用module非同梱の確認に成功（409ファイル）。
- 差分の空白検査と関連MDのlocal参照先を確認。
- 依存再取得を伴うpackage-workerテストは[前工程のEPERM／ENOTFOUND記録](E2E_BEST_PRACTICE_STATUS_CONSTRUCTOR_BINDING_2026-10-31.md)を継承し、この工程では再実行していない。インストール後worker smokeの成功を主張しない。

## 5 未接続・停止状態

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。非200 runtime承認・実sessionへのstatus transport採用・固定source受理・最終予約移譲・worker／payload bindingは完了していない。実接続・実通信・実機操作・設定変更・Pushは行っていない。
