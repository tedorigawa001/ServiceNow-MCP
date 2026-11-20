# AP05 G01：先行AP03採用記録の確定前レビュー

Version: release-ap05-g01-ap03-adoption-preconfirmation-review-draft-0.1 / Date: 2026-11-20。

Status: **静的レビューのみ。互換方針の採用記録を照合したが、候補仕様の根拠としての確定は未了。G01は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** `aec9e1d` は読み取り時のHEADであり、先行AP03の作業中差分や製品候補を含めた識別子ではない。

[G01のED照合表](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)は旧caseと切る／残す辺の台帳。本書は、その台帳に渡す**採用判断の出所・適用範囲・確定前の停止条件**を審査する。[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)のG01のみを対象とし、[G02の旧保証・許可](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)は別。先行AP03の5ファイルは変更しない。通常経路未切替、旧試験・期待値、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 どの記録を採用根拠にするか

| 先行ファイル | `aec9e1d` と作業中の版 | 確定前レビューでの役割 |
|---|---|---|
| [C05／C07採用記録](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md) | HEADに含まれない。未追跡draft-0.4 | 主記録。§5の2026-11-19のユーザー指示をC05-B／C07-B（D04）の範囲に限って読む。§3のC02〜04別審査は、後続記録を読む前の整理であり、案Pの根拠は下段 |
| [C02〜04／06採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md) | HEADに含まれない。未追跡draft-0.2 | 主記録。§5の2026-11-19の後続承認を、案P（D03）とC06の方針に限って読む。具体的な撤去対象と実装は範囲外 |
| [C07比較設計](BEST_PRACTICE_RELEASE_AP03_C07_SOURCE_CONSTRUCTOR_ARGUMENT_DESIGN.md) | HEAD draft-0.1＝比較・未選択。作業中draft-0.2＝採用先を追記 | 比較根拠。引数variant、共有呼出し、直接new／転送と出力JSの将来照合を補う。独立した再承認とは数えない |
| [AP02／03親設計](BEST_PRACTICE_RELEASE_AP02_AP03_REMOVAL_COMPATIBILITY_DESIGN.md) | HEAD draft-0.3＝個別判断案。作業中draft-0.8＝採用方針を反映 | 適用先と非対象の参照。撤去候補R・維持K・個別審査を引き継ぐが、候補patchや撤去承認は未確定 |
| [ED01〜07の引渡し](BEST_PRACTICE_RELEASE_AP02_AP03_AP05_ENTRY_DECISION_HANDOFF.md) | HEAD draft-0.2＝旧assertionと判断案。作業中draft-0.6＝採用方針を反映 | 影響行の索引。元7件の正規分類は未対応、個別処遇の承認は追加なし。採用方針を旧保証の代替にしない |

**確定前の参照差。** C05／C07主記録の実版はdraft-0.4だが、C07比較設計の2箇所、親設計と入口引渡しの各1箇所にdraft-0.2の参照ラベルが残る。同じパスを指していても、参照ラベルだけで同じ採用記録を固定したことにはしない。後日の確定レビューで、意図する参照版を明示し、過去版を指すならその時点と根拠を区別する。C02〜04／06の参照先と、旧版での「未選択」が判断当時の記録か現行の判定欄かも併せて照合する。今回は先行差分を修正・stageしない。

## 2 採用理由・範囲・越えてはいけない境界

| 方針 | 採用根拠と候補仕様に引き継ぐ内容 | 通常経路と、採用の対象外 |
|---|---|---|
| C05-B／D04 | [現行prepare](../src/servicenow/bounded-read.ts)はown descriptorによる受付で、外側Proxyの事前拒否がない。Aのままでは反射時のtrapを除けず、Cのplain/null prototype限定は非Proxyの既存入力まで狭める。Bは**最上位optionsのProxyだけをdescriptor／prototype反射前に固定同期拒否**し、非Proxyの許可own `signal`／`limits` を残す | 省略／明示undefined、非Proxyの独自prototype、許可own値の扱いを維持。継承値（getter含む）は読まず、継承 `synthetic_io` の存在だけでは拒否しない。nested signal／limits・snapshotの既存guardは変更しない。これらの候補での非介在は未検証 |
| C07-B／D04 | [現行source](../src/review/bounded-source.ts)はtruthyなcreationのkeyを読み、共有 `#openComposition` は省略経路でも第3にundefinedを渡す。第3の存在のみで拒否する案Aより、**宣言2引数、JSは第3に明示undefinedを1個だけ同等扱い**して互換差を限定。他の第3値・4個以上は中身を読まず同期 `invalid_input` | 既知の内部通常呼出しは将来2引数へ揃え、初期source結合・Permit・固定closeを残す。creation内key=undefinedは旧objectであり例外外。0／1引数一般、反射的な `length` の扱い、呼出し側の引数評価・class field初期化・割当て0までの保証はこの判断に含めない |
| C02〜04案P／D03 | 現行はoptions／signal→snapshot→target→旧transcript pin→生成と進み、先行同期throwと後段Promiseが別。案Qのように一部の旧先行検査を残しても全旧理由は再現できない。**C05-BのProxy確認を先にし、非Proxyの禁止own `synthetic_io` を値・列挙性によらず外側で同期 `invalid_input`**。signal値・snapshot・target・provider・生成等に先行し、旧prepared／後段の拒否Promiseは返さない | 禁止own keyがない通常入力では既存の先行理由、通常同期 `ConstructorSummary` と初期結合・片付けを維持。優先するのはmethod内の判定で、引数式やmodule評価は止めない。旧Promiseと同期throwの観測差を同一codeで帳消しにせず、Dのunknown／withheldも代替にしない |
| C06／型・import | [package宣言](../package.json)・[TS設定](../tsconfig.json)・[現行PK01](../tests/review/package-canonical-budget.mjs)は現行の出力と同梱期待の根拠。本番で残すmoduleの通常loadと、旧named importのlink時失敗、namespace上の旧名不在、**廃止と決まった専用module**のdeep解決失敗を分ける。専用overload／型依存のみを対象とし、宣言とJSの挙動を別判定 | namespaceへの動的import自体の拒否を一律に要求せず、package全体の `exports` 制約や互換shimを追加しない。AP02で具体名・登録／取得・runner・成果物を確定するまでは不在を主張しない。外部利用実態、実配布物と型／動的解決はUnknown |

## 3 ED01〜07への適用と未確認の到達辺

S／Kは[AP02撤去範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)（親設計のK番号とは別）。下表の「直接」は判断が対象入口・観測面にかかること、「横断」は別に通常／入口対照が必要なこと。採用された仕様と、現在の実装・旧testが観測する事実を混同しない。

| ED／旧case | 適用範囲 | 残す通常経路 | 候補で未確認の到達辺・停止条件 |
|---|---|---|---|
| ED01／SA-25 | C07-Bの旧creation同期拒否、C06のclaim・専用型。C05-B／Pを元source constructorのassertionにはしない | K02／04の通常2引数source・同rootの初期結合、通常 `claimStatusBinding`／同core会計、後段のPermit | S02の外部claim→static登録・creation→takeStatus／capture、転送呼出し・再export・宣言・深いimportの閉包と、内部通常呼出しのemit後順序。requests=0を全callback非介在や割当て0としない |
| ED02／SA-26 | C06のSA固有の旧名・class非露出・wrapper解決。最初の取得や候補の不在を旧再取得throwで証明しない | K01／04の通常constructor／factory／close・通常lifecycle結合。旧SA wrapper／FX04はHに維持 | S01／06の `takeStatusAcceptanceProbe`・`statusProbe`／static代入・runner・SA wrapper評価時取得を別々に確認する必要。休眠登録・別名・動的辺・JS／宣言／両mapは未確認 |
| ED03／ND-30 | C06のND固有の旧名・class非露出・専用module境界。SA側の不在／終了証拠を流用しない | K01／04の通常生成・close。純粋診断／無bridge・resource責務とUN62はB-03へ、旧ND／FX03はHに維持 | S01／06の `takeNativeStatusCompositionProbe`・`nativeStatusProbe`／static代入・旧driver／runner・ND root評価時取得。SAとNDで共用する旧probeの呼出し残り、driverと共有診断の分離は未確認 |
| ED04／ACK-34 | C07-BとC06。creation内keyのobject／undefined／nullはすべて旧creationで、JS明示undefinedの第3値とは別 | K01／02／04の同sessionの会計・通常source／Permit、拒否後の既存sessionの後続利用 | S02の外部consumer／capture、転送時の第3／第4引数、JSと型の差を確認する必要。元の後続payload=1は全状態不変の証拠ではない |
| ED05／ACK-35 | C07-BとC06。元testが設置した成功風staticは製品の現行APIではない。旧hook注入時の拒否と候補の不在は別 | K02／04の固定root内の実source／owner照合・通常の初期結合と後段Permit。公開verifierで代用しない | S02の旧採用口・再露出・別名・内部呼出し元の絞り込みと、通常ownerが同実参照で結合する根拠が未確認。元testに設置関数の呼出し数を付け足さない |
| ED06／ACK-36 | 案Pは旧synthetic入口に直接適用。C05-Bはoptionsの横断条件、C06はsynthetic overload／専用型。候補の同期拒否は元no-op bind後のPromise拒否を回復しない | K02／03／04の同source／Permit／port／登録owner・readyの実結合、通常同期summary・予約返却・通常停止とclose | S03／05／07のfake prepare・ack／capture・旧fake継続と、共有 `bindReviewReleaseSource`・生成／rollback／stop参照の分離が未証明。外部Promise利用・実配布物、元faultと候補の通常bindingは別の証拠 |
| ED07／CR04 | C07-Bの旧creation拒否とC06の専用型・入口。外部観測hook非採用は通常観測を止める仕様ではない | K02／03の通常 `#observeRelease`・実観測日時・pin済みpolicy・legacy判定・通常stop／close | S02／04／07の外部観測receiver→旧projection／比較／handoff、prepare／stop／rollbackの共有writer・解放への残存辺が未確認。Pの通常観測と旧capture／observe／accept未呼出しは別証拠 |

横断正対照は、C05-B／Pの「禁止own keyなし」に対する通常の同期summary・初期source／transport claim・同core会計・C/G/P=0・予約返却・固定close。通常sessionの本来のfetch、legacy release・Permit・停止は別の正対照で保つ。省略時の同期summaryを「何も生成しない」保証、または外部通常通信の成功に読み替えない。

## 4 確定前に残す判断

1. **採用記録を確定する別判断。** 2つの主記録と3つの参照文書について、版・当該節・採用指示の範囲・除外事項、EDごとの維持owner／未確認の到達辺を明示する。参照ラベル、旧版の記述、実ファイルの差を解消する時点は別に決める。先行差分とHEADは合成せず、本書による確定・編集・コミットの許可はない。
2. **仕様採用に含めないもの。** AP02の全候補patch／共有辺・外部利用の確認、旧保証の個別処遇、AP02実装、AP05候補検証と旧試験切替、AP06公開はそれぞれ別判断。通常経路・共有責務に影響不明が残ればUnknown／調査保留のまま。静的検索、既存テスト本文、同名や同codeだけで候補の到達／不在・実行同等性を認めない。
3. **G01停止条件。** 採用根拠の版と範囲、EDへの適用、切る／残す辺・共有ownerが必要な粒度で揃うまでG01は未充足。候補仕様の根拠として確定した場合も、候補revision・digestとG02〜04の承認を先取りしない。現時点はSL01から起動0。
