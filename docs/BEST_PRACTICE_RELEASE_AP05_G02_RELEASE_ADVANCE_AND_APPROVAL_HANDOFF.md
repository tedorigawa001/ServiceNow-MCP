# AP05 G02：限定リリースへの静的照合と最初の実施承認

Version: release-ap05-g02-release-advance-and-approval-handoff-draft-0.3 / Date: 2026-11-20。

Status: **静的照合・承認の経過記録。ED01〜07の処遇は未選択・未承認。候補revision・digest・観測手段は未確定。ED06の外部資料は段階1で未指定、外部利用はUnknown、閲覧0。G02未充足、SL01は起動0、公開不可。**

[限定リリース方針](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)を対象に、[個別処遇票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)と[横断審査表](BEST_PRACTICE_RELEASE_AP05_G02_ED_RECOVERY_CROSS_REVIEW_DESIGN.md)に沿い、承認前に分けられる証拠をまとめた。判断基準 `32a24ae` の1.16.2リリース記録はこの限定移行の候補・検証成績ではない。直近のED06境界審査以降、照合範囲の `src`／`tests` に差分なし。原票・旧case分類・別作業の下書きは変更しない。

## 1 未承認の全7票：静的確認で絞った論点

優先順はED06→ED04／05／01→ED07→ED02／03。下表は各票に返せる参照案で、試験結果ではない。共有する通常対照も、将来の同候補・同entry・入力・判定・終了が一致する場合の証拠参照だけを共用し、票を束ねない。

| 票 | 旧試験／現行sourceから切り分けられたこと | 候補に必要で未取得の根拠 |
|---|---|---|
| ED06／ACK-36 | [旧ACK-36](../tests/review/private-composition-ack.test.ts#L92)の後段Promise拒否は同期入口拒否と別。通常bindの正常復帰には登録確定が先行し、[既存境界の照合](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_BIND_BOUNDARY_STATIC_REVIEW_DESIGN.md)で単独欠失の適格入口と非介在観測は未確認 | 同じ通常経路で登録だけが未確定なのに最初のmetadata guardに到達する対照と、最初の拒否・取得未到達・終了を独立に示す根拠。未確認を非提供や影響なしへ換算しない |
| ED04／ACK-34 | [旧ACK-34](../tests/review/private-composition-ack.test.ts#L77)のcreation内3 keyと、C07-BのJS第3引数自体の明示undefinedは別。通常adapterは2引数、[共有準備](../src/servicenow/bounded-read.ts#L366)は省略側でも実3引数 | 直接／転送のC07-B、共有通常呼出しの2引数化と初期結合維持、拒否を挟む同sessionの計上継続・終了。通常の会計だけで旧claimのfalseを代替しない |
| ED05／ACK-35 | [元試験](../tests/review/private-composition-ack.test.ts#L86)の成功風staticは試験が設置する名前。現行sourceの旧creation用claimは[別の固定関数](../src/servicenow/bounded-read.ts#L73)で、[通常準備の初期照合](../src/servicenow/bounded-read.ts#L367)も別。元assertionは同期拒否とcapture未呼出し | 旧creationを信頼しない結果と、通常の同ownerへの実結合は別対照。元試験でstatic呼出し回数を確認したとせず、配布物の旧入口・別名／到達辺の不在も別に確認 |
| ED01／SA-25 | [元試験](../tests/review/source-status-binding.test.ts#L69)の直接claim=false、constructor拒否、capture未呼出し、requests=0を特定。requests=0は資源未生成や通常の初期結合を示さない | 通常source／Permit・初期結合の正対照と旧claim／callbackの不在を別確認。ED04のpayloadを越境適用しない |
| ED07／CR04 | [元試験](../tests/review/release-comparison-receipt-session.test.ts#L25)が直接見るのは拒否と3 callback未呼出し。[通常source](../src/review/bounded-source.ts#L146)の観測日時・policy・release判定を、旧callbackの不使用から推定しない | 通常観測／停止・rollbackを残したうえで、旧観測・receipt／handoff辺が配布物にないこと。callback未呼出しを全時計・共有writer非実行としない |
| ED02／SA-26 | [SA wrapper](../src/review/abort-scope-evidence-source-status-probe.ts#L39)は評価時に取得。[旧case](../tests/review/source-status-binding.test.ts#L76)の直接観測はclass own名不在と再取得の同期throw | 通常loadを正対照にしてSA固有のnamed／namespace、登録・wrapper・runnerの不在を独立確認。初回取得の直接assertionやNDの結果との同一性は主張しない |
| ED03／ND-30 | [ND wrapper](../src/review/abort-scope-evidence-native-diagnostic.ts#L1648)も評価時に取得するが、[旧case](../tests/review/native-session-composition.test.ts#L113)のclass名と取得口はND固有 | ND専用driver・登録・wrapperの不在、共有診断・資源所有・解放の維持を別判定。SA結果や開発側fixture／B-03をそのまま代用しない |

## 2 停止点と承認の切り出し

この静的照合で旧保証の受容・回復を決裁できる票はない。特にED06は、未変更候補の通常経路で単独欠失と最初の拒否を両立させる方法が未確認で、外部資料も対象未指定。**外部照会・閲覧、候補変更、保証低下の受容を先に求めず、回復のための開発用対照を試作できるかを独立に確認する承認**を最初の依頼とする。

| 切り出す範囲 | 条件 |
|---|---|
| 承認対象案 | ED06だけ。開発・テスト領域に隔離した合成入力の対照を追加し、新規の対象試験だけをローカル実行する。正規の同owner／Permit前提を揃えた正常と、登録の有無だけを分ける陰性を別runで扱い、最初の拒否点・後続取得／dispatch・終了を区別できる範囲を確認する |
| 実施限界 | 本番source／配布payload、旧試験・期限・設定、発行口・受付を変更しない。既存の判定境界を開発側で参照できない、別の故障要因が混じる、観測で拒否が変わる、または独立した終了を確認できない場合は停止し、不足として残す。新規の本番hook・friend・公開getterは含めない |
| 成績の扱い | 開発上の成立性を示す補助証拠に限る。別rootや模擬判定だけの成功を通常の実class／未変更候補の同等性に数えない。成功してもAP04の受容、G02充足、候補起動、非提供、公開の許可ではない |
| 対象外 | 外部資料の指定・照会・閲覧、実通信、既存試験変更、AP02本番撤去・候補pack／展開・限定対照の実process選定、コミット・Push・公開。G03／G04の候補pin・数値・観測手段・保全方式／先は未確定または未承認のまま |

承認が得られない、または試作の前提を満たせない場合、旧保証と閉鎖条件を保ち、この限定移行は保留する。[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)に必要なG01〜04、[候補のP+／P0／PΔ受入](BEST_PRACTICE_RELEASE_AP05_PK01_PK04_CANDIDATE_ACCEPTANCE_DESIGN.md)、B-03／UN62、AP06の最終検証・版・公開は後続の別判断。ユーザーのレビューを後日にすることは、いずれの承認の代用にもならない。

## 3 承認後の経過と現時点の停止

- 開発用合成対照と対象テストの実行は承認済み。対象テスト2件の結果は[開発用owner登録対照の結果](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_OWNER_REGISTRATION_CONTRAST_RESULT.md)に記録した。そこで確認したのはowner関数の挙動までで、候補配布物や通常adapterでの保証回復は未確認。
- 外部影響確認の段階1について、匿名メタ情報だけで対象を指定する範囲は承認済み。最初の回答は「不明」、その後の回答は「資料なし」。今回提示できる対象資料はないものとして記録する。[段階1の様式](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_EXTERNAL_USAGE_STAGE1_MATERIAL_SCOPE_DESIGN.md)の資料・対応参照は未指定のため、段階1で停止し、段階2〜4・閲覧の個別承認審査には渡さない。資料が他に存在しないことや「外部利用なし」「影響なし」を確認したわけではない。外部利用はUnknownのまま。
- 再開条件は、許可された匿名メタ情報により、利用側の抜粋と旧版の実解決記録を同じ呼出し箇所・利用時点に結べること。外部照会・取得・本文閲覧を追加で許可したことにはならない。候補側の欠失対照・非介在観測も別に未充足のまま。

今回の更新は本MDの経過記録のみ。通常経路・旧試験／期待値、正式発行口・C実行入口／body起動閉鎖、全体受付無効、調査保留・閲覧0・起動0を維持する。この更新にあたり外部照会・閲覧、実装・故障注入・試験実行・梱包、設定変更・コミット・公開・Pushは行わない。
