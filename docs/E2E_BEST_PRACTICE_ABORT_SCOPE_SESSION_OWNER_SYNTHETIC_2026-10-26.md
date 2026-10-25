# BR-006 prepared owner・session claim・同期revokeの合成検証（2026-10-26）

## 1. 範囲

実BoundedReadSession class＋fake fetch/source/permitで、owner内部型・session生成claim・AuthSnapshotIdentity／ready世代結合・stop/close時の同期revokeを検証した。PDI E2Eではない。実source／ReleasePermit／証拠専用transport／worker／上位結果には接続しない。

正式証拠発行は常に拒否し、ownerはprepared／revokedだけ。VM／監視／telemetry保留、Unknown・全体受付無効を維持する。公開規則・schema・設定・認証権限・HTTP許可先・210試行／60秒等の上限は変更しない。実機操作・トークン発行・設定変更・Pushは行わない。

## 2. 実装

- servicenow/review-evidence-lifecycle.ts：非公開WeakMapで実session／認証snapshot identity／ready世代／claim／owner bindingを保持。秘密を新objectへコピーせず、外へ返さない。
- bounded-read.ts：constructor登録、同readyPromiseの認証成功／失敗通知、stop/closeのabort前同期revokeだけを追加。HTTP・retry・会計・資格情報の既存解放処理は変更しない。
- abort-scope-evidence-session-fixture.ts：fake source／permit発行と検査だけ。実sourceは登録portを呼ばない。未知／別session sourceを拒否してから既知session claimを同期消費する。
- 正常ownerにも閉じたgateはinvalid_stateを返し、receipt／seal／active権限を作れない。statusは固定state/code/disabled/revocationsだけで認証参照を返さない。
- auth-ready済みownerは通常phase cutoffだけではrevokeせず、hard stop／closeは一度だけ失効。close前の理由を後から上書きしない。認証完了できなかったsessionは新ready世代を発行しない。

runtime coreの内部fixture登録portも同processの信頼コード向けで、悪意あるdeep importの隔離ではない。ただし何を登録しても正式証拠へ進むAPIはない。実source由来の真正性は本工程では証明しない。

## 3. 新規試験

新規31件：追加HTTP／byte課金ゼロ、owner handleの非列挙、正式発行拒否、同session別source二重生成、生成失敗後の修正拒否、他session／auth世代／permit clone、認証未完了／古い世代、fixture改変、snapshot固定、per-user・service-account cached/exchange、同期revokeとtransport abort順、close一度だけ、hard期限とphase cutoff、401/403、受信超過、認証枯渇／phase期限、late認証完了、clone／他issuer／raw owner、同値資格情報の後続session、開始済み取消を確認。

テストはfake fetchに渡ったヘッダーをダミー値だけで比較する。実資格情報・コード本文は取得／出力しない。実sessionのfetch回数・statsがclaimやgate照会で増えないことも確認する。

## 4. 途中結果と修正履歴

1. 最初の26件とbuildは成功。
2. 停止理由の境界2件を追加して、upstream_unavailable／phase_deadline_exceededがinternal_review_errorへ変わる失敗を再現（26成功／2失敗）。原因は新coreの理由一覧が既存ReadFailureCodeを網羅していなかったこと。網羅性を型で検査する固定一覧へ修正した。
3. 修正時、satisfiesの改行で構文エラー（TS1434と2 suiteのtransform失敗）が発生。式と同じ行へ戻して解消。期限・retry上限は変更していない。
4. snapshot固定試験でRequestInit全体をHeadersへ渡すfixture誤りにより1件失敗。headers propertyを検査するよう修正。途中の関連19ファイル実行も同じ1件失敗／756成功だった。
5. fixture修正後の関連9ファイルは313件成功。最終関連19ファイル等の結果は下記最終確認へ記載する。

## 5. 最終確認

- 新規owner試験31件成功。関連19ファイルは757件成功（既存合成証拠、bounded取得、release gate／C方式、adapter／selection／soft deadline、R2 session／OAuth-sessionを含む）。
- 最終npm run build成功、変更source3ファイル／新規test／梱包scriptのESLint成功、梱包scriptのnode --check成功。
- npm pack --dry-run --json --ignore-scripts：373ファイル、runtime lifecycleあり、dist/review/abort-scope-evidence*は0件。新しいruntime dependencyの成果物4件分が同梱され、fake issuerは同梱されない。
- 実tarballを一時展開し、既存node_modulesを利用してpacked bounded-readとlifecycleのimportを確認した。session生成・ネットワーク開始なし。新規のproduction-only npm ciを行った検証ではない。
- 完全なpackage-worker.mjs（production-only installを含む）・全リポジトリ試験・実機試験は未実施。npm cacheはprocess限定の一時pathを指定し、設定ファイルを変更していない。
- 更新3文書の相対リンク10件・末尾空白確認に問題なし。git diff --check成功。

## 6. 残課題

実source生成claimとReleasePermitのprivate／deep snapshot、取得mode排他、選択window／行・payload受領物、phase世代に結ぶ発行permit、typed cleanup/body証拠、単一C/G/E/R/clock、実worker job移譲、final seal／上位診断への結合。正式発行口はこれらの接続・承認前に有効化しない。

runtime lifecycleはbounded-readのimport依存なので同梱対象。fake issuerは既存prefix除外を維持する。梱包scriptにはruntime moduleの存在確認を追加したが、script全体の実行とdry-runの確認を区別して記録する。
