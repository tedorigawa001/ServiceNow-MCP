# OL-03 完全collectorの費目別計数・上界候補の合成検証

Date: 2026-10-20 / Scope: private合成source、test-only監査、独立算術oracle。OS/PDI E2E・運用受付ではない。

## 1. 変更範囲

SharedBudgetへ`cfg(test)`限定のobserverを追加した。成功して実加算されたworkだけを記録し、課金後guardの取消/期限でも取り消さない。製品のwork/期限/byte予約/停止分類は変更しない。所有者guardはtest buildだけで有効となり、Control/Groups/Route/Walk/Enumeration/File/Sealへnestedに振り分ける。unassignedと総和を検査し、取得時prechargeのcleanupを二重に課金しない。

collector試験の算術oracleはgroups/route/scan_work計算器を呼ばず、fixture entryから親別子数・depth・chunkを再計算する。設計書に追加済みのgroups `min(P,E−c_0)` と規模試算（b0dddfb）を保持した。新しい運用profile・model ID・quota producerではなく、準備費を課金済みと扱わない。算術経路の独立性であって、独立した人手評価や全入力上界の形式証明ではない。

## 2. 基本fixtureの計数と式の不備

| 費目 | 実費 | draft-0.3の候補枠（tail前） |
|---|---:|---:|
| control | 52 | 59 |
| groups | 49 | 51 |
| route | 46 | 47 |
| walk | 1223 | 1278 |
| enumeration | 322 | 342 |
| file | 174 | 183 |
| seal | 36 | 36 |
| 未割当 | 0 | 0 |

実費合計1902。tail21込みの候補上界2017（r=0）。source876操作、payload4590 bytes、peak owner5は既存値を維持する。

draft-0.1/0.2はcontrol上界38に対し実費52で失敗した（exit 101）。最後の保持rootのrecord/snapshot＋比較の所有が式から漏れていた。該当処理は実費20、上界はrecord20＋比較1の21なので、**16+4E+D → 37+4E+D** と明示的に修正した。その他controlは10+4E+D、最後の20を加えfixture52。製品処理・予算上限を増やした修正ではない。総上界1996>実費1902だけの照合なら見逃したため、費目別の検査も維持する。

## 3. 成功・拒否・中断の範囲

- 新規8テスト関数（collector6、observer単体2）。関数内の繰返しを独立評価ケース数へ数えない。
- 成功10 shape×Initial/BeforeM4/AfterM4：通常、空file、65537-byte file、nested index、index先頭/末尾、追加depth1、width16/depth8、width128、追加directory深さ63＋file（相対64 component）。基本1902、width128は38440、相対depth64は123797 work。費目別/総上界内。
- 余剰/重複/missing/重複dot、不正UTF-8、cursor/祖先/leaf差替え、index pin不一致、hash不一致、短読取、EOF1、未知FS/noexec、ACL present、metadataのvariant不正、xattr名サイズ超過/戻り長不一致を拒否。
- quotaなし・各operation/live/name不足を確認。大きい成功shapeは試験だけでoperation枠100万/live8を明示指定する。標準小fixtureの枠10000や本番の未承認quotaを増額したことにはならない。
- 基本fixtureの全876 source操作点：非cleanupは取得失敗、cleanupは解放不明を注入。全876点の取消・期限も注入。fake handleは一度だけ解放され、部分観測を返さない。取消とcleanup不明が重なっても最初の取消理由を保持する。
- 共有workの残0〜1901の全不足prefixでLimit、1902ちょうどではcollector核が成功。呼出し元AfterScanは追加費が必要なので、その結果と核の結果を別々に保存する。
- 課金直後の14点（1/4/8/32/49/100/500/1000/1500/1865/1866/1867/1901/1902）で取消/期限を注入。加算済みunitを保持する。全checkpoint位置を網羅した主張ではない。
- data/EOF双方でEINTR0/1/8は成功、9回目はReadFailed。3roundで同じbudget/start/payload/残retryを共有し、最初のEOFで8回消費後は残0のまま。核合計は3×1902＋24=5730、sealは3×36=108。AfterScan/FinalIndexは各回別に実行し、Sの監査へ含めない。operation累積quotaの保証とは区別する。

## 4. red/green・試験側の修正記録

1. ownership付与前のtracerは未割当1902で失敗し、付与後は0で成功した。
2. 候補式はcontrol52>38で失敗し、最後のroot処理を別計上して解消した。
3. 感度試験でoracleのseal枠を一時的に0とすると、seal実費36>0で失敗した（exit 101）。変更を復旧した。余裕係数を1下げれば必ず失敗するとは要求しない。
4. 初回のsource点試験はrun戻り値のpayloadを操作数と取り違え、存在しない点への取消を期待して失敗した。State.calls/traceへ修正した。
5. workがちょうど残る試験では、collector成功後のAfterScanのLimitと核の失敗を混同していた。両結果を分離し、実装の厳密再照合は削除していない。
6. clock callback中の取消は取消loadより後になり得るため、最後のguardへ遡及して失敗させる期待は不正だった。test-only observerで実加算直後・post-guard前にflagを設定する。期限は同clockで注入する。observer単体でもpost-charge失敗を計数する。
7. 初回clippyでobserverのnested ifを指摘され、同じ条件のlet-chainへ整形した。

## 5. 最終検証

最終再実行結果：`bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml`は **689 passed**（既存681＋新規8）。全targetsのclippy（-D warnings）は警告なし、release build・cargo fmt check・git diff checkも成功した。更新4文書のcode fence/末尾と参照先62件の存在を確認した。実OSやMCP通信のテストは行っていない。

## 6. 未対応・停止維持

最大N/最大file/全metadata異常variant/全失敗組合せ・全ABI挙動・全checkpointの形式的証明は未実施。運用用のchecked算術/shape guard/別receipt・round binding検査は今後のsealed profile/計算器で必要であり、本test oracleで提供したとしない。

3roundのoperation/name/cleanup累積台帳、保護されたcontext/quota producer、other費とwork予約、通常strictへの型付きbridge、OS/backend、更新lease/ABA/検査後変更防止、hard期限とhost cleanup終了票は残る。全体受付無効・telemetry保留・本番policy未投入・DER/absence停止・通常v2 Unavailable・gate92を維持する。実機操作・トークン発行・設定変更・permit発行・コミット・Pushは実施していない。
