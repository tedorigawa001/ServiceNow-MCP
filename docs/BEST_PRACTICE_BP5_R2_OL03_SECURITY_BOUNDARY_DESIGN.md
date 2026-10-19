# BP-5 R-2 OL-03：Security API境界・合成アダプターの内部契約

Version: draft-0.1 / Date: 2026-10-19 / Status: 内部契約と合成backendのみ。実Security/CF API・署名検査・permit発行は未実装。

## 1. 目的・対象外

[署名設計](BEST_PRACTICE_BP5_R2_OL03_SIGNATURE_DESIGN.md)§5/§7を小さな内部Rust契約へ分離する。
[型付きregistry](BEST_PRACTICE_BP5_R2_OL03_TYPED_SIGNATURE_POLICY_DESIGN.md)の参照照合と純粋entitlement比較器を再利用する。
`signature_boundary`はprivate moduleで、通常起動から呼ばない。合成backendは`cfg(test)`だけに置く。
公開の検証成功hook・任意requirement文字列・外部registry・flags上書き口はない。

telemetry調査は保留。本番registry・発行者・証明書・採用SDK/OSの承認を進めたものではない。
Security.framework/CFへのFFI、実署名操作、ネットワーク、PDI、token発行、設定変更は行わない。
本書の意味profileはプロジェクト契約であり、Apple SDK数値定数や実API動作を確定する資料ではない。

## 2. 入出力と型

| 型 | 内容・制約 |
|---|---|
| Request | registry参照、policy ID、role、期待identity、**外側検査の開始Instant**、共有cancel flag |
| BoundPolicy | registry binding成功後だけ内部取得するtemplate/anchor/certificate class/Team ID/identifier/全static flagsのborrow。Debug/serializeなし |
| Identity | device/inode/size/SHA-256。hashは小文字64桁、size非0。検査元データであり、単独でOS真正性を証明しない |
| ValidationProfile | `OfflineFullExecutable`のみ。network不要・実行bytes検査省略なしという要求。SDK flagsの正確な組合せは後工程 |
| Status | Valid / Invalid / RequirementMismatch / Unknown。不明状態は拒否、情報取得成功と区別 |
| SelfObservation | launcherのdynamic validity状態と、対応するself実体identity。単なるvalid状態だけで別selfを受理しない |
| Snapshot | layout、署名形式、Security側実体identity、発行者、全static flags、型付きentitlement観測 |
| ComparedSnapshot | entitlement件数だけ。Debugは`ComparedSnapshot(not_execution_authority)`。permit/exec型への変換なし |
| Rejection | 固定enumのみ。raw OSStatus/CFError/path/issuer/blobを外部へ出さない |

発行者の投影文字列は128bytes・制御文字なし。entitlementの64KiB・32keys・key128bytes/重複禁止は既存比較器を再利用。
将来のCF backendは、これらをRustへ無制限に確保した後で判定するのではなく、型/サイズ確認を取得・投影時に行う必要がある。

## 3. 呼出し順序と停止

1. 開始予算/cancelを確認し、registry ID/digest・policy ID/roleを解決。未知templateは拒否。
2. 安全読取側の現在identityと期待identityを照合。
3. role指定でcode handleを取得。null相当の`None`や取得失敗は停止。
4. 承認されたBoundPolicyと固定profileで署名・requirement validityを要求。Unknownや不一致は停止。
5. launcherだけdynamic self validityとself identityを確認。Nodeでself検査を代用しない。
6. signing情報を取得。thin arm64以外、unsigned/ad-hoc/linker-only/unknown、別実体、別発行者、全static flags差を拒否。
7. entitlementを既存の型付き完全一致比較器へ渡す。CFNumber 1相当をboolean trueへ変換しない。
8. 安全読取側のidentityを再取得して照合し、handleを解放。最後に予算/cancelを再確認して非authority集計を返す。

全backend呼出しの前後で同じ10秒予算を検査する。期限/cancelがAPI応答と同時に到来した場合は、応答を捨てて停止する。
cancelはdeadlineより先に判定。API失敗後の弱いflags再試行、online fallback、別Node探索、再署名はない。
意味profileの要求をnative backendが実際に満たすかは未検証で、合成試験のprofile一致を実flags適合としない。

## 4. entitlementの欠落とabsence

欠落/型不明は`UnsupportedOrUnknown`として拒否する。本境界は欠落を`AbsenceProven`へ変換しない。
合成backendから明示された`AbsenceProven`は、純粋比較器の既存契約どおりempty期待値だけで一致候補になる。
これは本番でabsenceを生成できる証拠ではない。native producerの取得flags/対応形式/矛盾検査の条件は未確定で、承認までnative正常系へ使わない。

## 5. 資源・秘密・時間の限界

backendは所有handleを返し、inspectがRAIIで管理する。エラー・null snapshot・取消・期限後の成功応答でも解放する。
合成backendはDrop counterでこのRust所有権を確認する。取得処理の内部で失敗したCF objectの解放やCF retain/releaseの正しさは、未実装のnative backendで別途検証する。
raw CF型/証明書/blobや自由記述errorを境界へ持ち込まない。入力型はDebug/serializeを実装しない。

同期API呼出し前後のdeadline検査であり、停止しないFFIの強制中断は未解決。CF内部の確保量・thread/FDも制御済みとはしない。
identityの前後一致だけで、Security path APIと保持FDの同一性や検査後差替えを証明したとはしない。
今回は呼出し順序を検証する合成契約にとどまり、ledger reader・deployment scan・exec gateへの一体接続は未実施。

## 6. 次工程

- 採用SDKにおける公開API/CF型・固定flags・requirement template/証明書条件を公式根拠と照合。
- native backendのFFI/RAII、失敗時の部分取得資源解放、unknown OSStatus/null/矛盾観測の投影を設計・検証。
- self/static code/FD/path結合、更新排他、強制停止とsingle-thread/FD前提を具体化。
- 本番policy/registryの人による承認と信頼済みbuildへの組込み。

詳細な合成結果は[検証記録](E2E_BEST_PRACTICE_R2_OL03_SECURITY_BOUNDARY_SYNTHETIC_2026-10-19.md)を参照。現行runtime gateは92のまま。
