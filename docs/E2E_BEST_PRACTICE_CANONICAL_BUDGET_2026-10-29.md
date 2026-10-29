# CM-01 canonical会計内部coreの純粋合成検証

Date: 2026-10-29 / Scope: C/G/P・readonly view・first stop・注入clockのみ。

## 1 対象と境界

[差分設計draft-0.2 §9](BEST_PRACTICE_ABORT_SCOPE_CANONICAL_SESSION_MIGRATION_DESIGN.md#9-cm-01の内部契約と純粋fake検証)の[内部core](../src/servicenow/review-canonical-budget.ts)を追加した。writerとreadonly viewは一つのゼロ初期化状態を参照し、stats／lease／診断から更新portを取得できない。実session・初期stats・snapshot・claim・sourceを受領する口はない。

実classの旧counterは変更しておらず、CM-02の置換は未実施。native／bootstrap／sourceへのimport・実transport・実機操作・設定変更・token発行も行っていない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 2 新規32件の確認範囲

[canonical-budget.test.ts](../tests/review/canonical-budget.test.ts)で次を確認した。Gは投入したbyte長、Pは試験側のTextEncoderによるUTF-8長、Cは明示的なdispatch回数から期待値を作り、製品statsをoracleへcopyしていない。

| 境界 | 結果 |
|---|---|
| 単一会計とreadonly view | ゼロ初期化、C/G/P更新とleaseが一致。frozen snapshot・readだけのleaseから更新不可 |
| 低減上限 | 上限引上げ、非整数・ゼロ、未知キーtoStringをclock呼出し前に拒否。設定copy後の元object変更は無効 |
| G | 上限等号は成功、超過chunkの加算を残して停止。停止後の再課金なし |
| P | 日本2文字をUTF-8 6byteとして加算。単体超過はpayload_limitの局所拒否、総量超過はpayload_budget_exceededで停止し、費用保持 |
| Cとlegacy固定4枠 | Q=6で通常2試行、拒否後もfinal4試行を許し計6。枠の二重予約・返金なし |
| 数値不正／overflow | 負数・NaN・Infinity・非整数、safe integer加算overflowは更新前拒否。byte列の巨大確保なし |
| 内部専用理由3種 | 内部ではevidence_binding_mismatch／invalid_observation_time／invalid_stateを保持し、公開側はinternal_review_error。後続理由で上書きなし |
| 未知理由・例外 | PRIVATE markerの未知stop／clock例外は固定理由となり、raw値を診断へ保存しない |
| clock | 有限・非負・deadline以下・非増加を確認。hard等号で停止、元clock関数の差替え無効、新しいt0なし |
| 再入・close | clockからの会計再入で停止。close連打はidempotentで、後続更新拒否・既会計保持 |
| 混入防止 | 初期値付き入力・session形classのclock採用拒否。別budgetの更新／停止は対象budgetへ影響しない |

CM-01のconstructorはtrustedなclock／設定を前提とする。OS時計・実session・I/Oの証明ではなく、typed R・phase／attempt window・reader cleanup・実credential破棄は検証対象外である。

## 3 REDとGREEN

- 最初の会計経路はmodule未実装でRED、内部coreの追加後にC/G/Pとreadonly lease一致のGREENを確認した。
- 未知stopがraw文字列を返すREDを確認し、有限理由の許可表と固定internal_review_errorへの正規化でGREENにした。
- toStringという未知limitsキーを受け付けるREDを確認し、own許可キー照合へ変更してGREENにした。
- initial会計の余剰入力を黙って受け付けるREDを確認し、constructorの許可キーとplain clock形状を検査してGREENにした。初期値を取り込んだのではなく、余剰入力を無視していた点を訂正した。

## 4 実行記録

Node v24.18.0。製品・テスト期限は変更していない。既存全体合成試験のローカル待受だけを許可した実行で、外部ServiceNowには通信していない。

| 確認 | 結果 |
|---|---|
| 新規CM-01 | 1 file／32 tests PASS |
| 全体合成 maxWorkers=3 | 188 files／5,734 tests PASS、35.42秒 |
| build／変更対象ESLint | PASS |
| offline梱包＋compiled純粋smoke | PASS、401 files。CM-01の4artifactを同梱、fixture／testsを除外 |

[梱包script](../tests/review/package-canonical-budget.mjs)はnpm offline／ignore-scriptsのdry-runと、[compiled fixture](../tests/review/fixtures/compiled-canonical-budget.mjs)を実行する。compiled coreにruntime importが無いことを確認し、fetch／Response／ReadableStreamをthrowに差し替えた環境で会計・内部理由の写像を照合した。native APIやfixture台帳を使って成功させていない。

コミット前再確認：HEAD＋今回の9ファイルだけをindexから一時領域へ展開し、既存node_modulesのみを依存として参照した。build・変更対象ESLint・全体188 files／5,734 tests（34.70秒）・CM-01とNA-02／NA-03のoffline梱包／compiled確認がすべてPASS。梱包は401 filesで、他の作業中ファイル・実session接続・実通信は含めていない。

## 5 残課題

次はCM-02でlegacyの更新順・stats／#runLeaseを同coreへ中立移行する。現行G>=capのattempt前拒否、phase／busy・認証チェック、payload_limitの局所性、最初の内部理由と公開理由の写像を維持する必要がある。CM-01の単独dispatchを完全なHTTP受付判定とは扱わない。

typed予約／正確なdispatch到達点でのC計上はCM-03、private composition／source採用はCM-04の別工程。最低Node版・実session接続・全体work／heap上界・本番capの承認は今回の成功で埋めない。
