# AP05 G02：ED06／ACK-36 候補差分の境界と検査入口

Version: release-ap05-g02-ed06-ack36-candidate-scope-and-entry-draft-0.1 / Date: 2026-11-20。

Status: **静的設計案のみ。候補差分・revision・digestは未確定。ED06の処遇・観測手段は未承認、外部利用はUnknown、外部資料の閲覧0。G02未充足、SL01から候補起動0。** `32a24ae` は読取り基準であり、限定リリース候補ではない。

[通常経路と証拠台帳](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_CANDIDATE_PATH_EVIDENCE_MAP.md)を、どこまでを候補差分とし、配布物のどこから調べるかに絞る。[AP02範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)と[G01のED06行](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)の範囲を広げない。以下は将来の差分審査用であり、改修・検査実施を許可しない。

## 1 候補差分の切り分け

| 区分 | 将来の候補差分で照合する範囲 | 承認前に止める差分 |
|---|---|---|
| 切る：旧synthetic専用入口（S03／ED06） | [sessionのstatic prepare](../src/servicenow/bounded-read.ts#L303)のsynthetic overload・`PreparedSummary`と、旧`#prepareCompositionIO`への実行辺。C02〜04案P／C06に対応し、禁止own `synthetic_io` は生成・取込より前の同期拒否として残す。通常の同期`ConstructorSummary`は存続 | static prepareの全撤去、通常の同期準備の変更、旧Promiseを返す互換shim、新しいfixture／friend入口。禁止入力の同期拒否は旧Promise拒否の代替証拠ではない |
| 切る：旧fake I/Oの依存・同梱（S05） | `pinCompositionFakeIO`の実行辺と旧専用モジュールのJS・宣言・両mapを配布側から分離。静的／解決可能な動的参照、再export、別名・型参照・mapの埋込みを個別に照合。旧試験と開発側の保証は別管理 | ファイル名だけ消し、別名や依存経由で残す。通常fetch・共有のbootstrap契約・canonical予算を巻き込む。旧試験の削除・切替、既存梱包検査の期待値反転を本件で扱う |
| 差分境界：共有項目から旧継続だけを分離（S07、S04は影響確認） | 旧ack／capture・時刻引渡し、およびそれらに固有の停止・破棄への参照を、定義・利用・rollback／closeまで辿る。全利用箇所を「旧専用」「通常との共有」「未解決」に分類し、旧専用と確認した変更だけ審査対象にする | 共有writer・release観測・会計・通常の解放を旧専用とみなす。S04の時計比較系全体、別の値モジュール、SA／NDのfriend、ED01〜05・07の処遇まで本件の承認に含める |
| 残す：通常の結合・取得（K01／K02） | 実client factory → 同sessionのcore／snapshot／lease／owner → 通常2引数source → 親 → 実release判定（観測と既存fallback） → matched時の同source／Permit／port → [session bind](../src/servicenow/bounded-read.ts#L632) → [owner登録](../src/servicenow/review-evidence-lifecycle.ts#L242) → 最初のmetadata guardと取得 | bindの空実装・成功値だけの差替え、初期source結合による後段登録の代用、登録前のmatched返却、source／Permitのコピー又はguardを迂回した取得 |
| 残す：通常の準備・停止・解放（K03／K04） | 省略時の同期準備、初期source・status binding／同core会計・予約返却。主理由の優先順、元期限・取消、通常`stop`／rollback／close・owner解放、既存のadapter／workerと出力を維持。C07-BのJS明示`undefined`互換と、内部の通常2引数呼出しは別の照合点 | 未確認をcleanup成功で埋める。通常のC/G/Pや元予約を付け替える。source正対照だけでadapter／workerの停止を確認済みにする |

将来の差分審査には **変更ファイルと定義 → 呼出し元・解決先 → 失敗時の停止・解放 → 候補成果物上の予想位置 → 旧assertionへの影響** を一行で紐づける。到達先不明、通常との共有責務が分離できない、または旧保証の処遇未決なら、差分を候補として採用せず起動0。AP03の採用記録は互換仕様の根拠であり、AP02実装やAP05実行を承認するものではない。

## 2 構造照合の起点と実行正対照の入口

| 入口 | 将来固定する対象 | 証明すること／しないこと |
|---|---|---|
| 構造の起点（評価・起動なし） | 展開済み同tarballの想定`dist/tools/best-practice.js::executeBestPracticeToolCall`から、`dist/review/update-set-adapter.js`、通常client・session・source、lifecycle／予算への実解決辺を読む。各辺のimporter・specifier・条件・解決先・内容pinと成功／短絡を記録。公開main／binからの到達と旧専用の不在・混入は別欄で照合し、server／MCPは起動しない | 現行起点は[tool](../src/tools/best-practice.ts#L20)と[adapter](../src/review/update-set-adapter.ts#L87)。上のJSパスは[コンパイル配置](../tsconfig.json)からの想定で、[package宣言](../package.json)だけでは同梱・解決を証明しない。片側経路の確認や文字列の不在で閉包を確定しない |
| SL09に対応する通常の実行正対照（将来案） | 検査器は配布物の外に置く。同展開の`dist/servicenow/client.js::ServiceNowClient#createBoundedReadSession`と`dist/review/bounded-source.js::BoundedUpdateSetSource`を使う。実factoryの同sessionを保持し、`session.run`内で通常2引数sourceを生成。固定の局所fixture fetch以外は実メソッドを使う | source/session境界の前進と終了を確認する。adapter本体・tool・実workerはこの正対照では動かさない。`withBoundedUpdateSetSource`やsource直接生成による別runを同じ証拠に合算しない |
| 他slotとの境界 | [既存manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)のSL08（省略時の同期準備）、SL15（開発fixtureと通常の境界）、SL16（旧fake配布不在）、SL17（禁止入力の同期拒否）は別に記録。所定のP+ → P0 → PΔ順は不変 | FX05は旧compiled証拠でACK-36元faultの代替ではない。PΔは検査感度であり、未変更候補での登録単独欠失の証拠にしない。新slot・変異は追加しない |

正対照案の受入は、外部へ委譲しない一回分の固定GET列（親・release観測・metadata）、同sourceが返した同じPermitによる最初の`listMetadata`、合成metadata 1件、要求3・固定fixtureから独立算定した受信bytes・payload bytes 0。guardより前に状態・時刻・leaseの診断確認を挟まない。`run`が帰った後、同sessionの終了・解放と閉鎖後の同Permit拒否（追加取得0）を別記録にする。閉鎖後の拒否は、登録だけが初めから欠けたこととは異なる。runner・worker・stdio・保全の終了証拠は[G04](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)の別判定であり、sessionの終了と合算しない。[開発用正対照](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_NORMAL_SOURCE_POSITIVE_RESULT.md)は直接生成の別runであり、この実factoryからの候補実行結果ではない。

## 3 ここで止める条件と次の承認境界

1. **差分準備と候補検証は別。** 具体patchの準備は対象と除外、通常の所有・解放境界、未代替保証の扱いを示したうえで別承認。候補のcommit／tree、独立検査器・入力、Node実体／実解決依存を指定し、[候補入場](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)のG01〜04・時間枠／cleanup予約を満たさなければSL01起動0。空build → 同buildのpack → 同tarballの隔離展開の各pin、前slotの終端または実解決が不一致・未確認なら後続0。作業treeのdist／source・隣接依存・外部registryに迂回しない。
2. **登録単独欠失は未解決。** 旧Promise拒否、案Pの早期拒否、通常の実bind正対照、開発owner対照を別々に保持する。bindを差し替える、release段階のbind失敗を後段の欠失に数える、またはguard前の診断で最初の拒否を変える対照は不適格。適格な既存境界と非介在観測の根拠がない限り、候補での欠失対照は起動0。構造と通常正対照だけを束ねてもG02回復・非提供を自動承認しない。複数証拠で受入基準を見直すなら残差を明示し別審査とする。

本書は差分と検査入口の案のみ。旧試験・元期限・正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。候補作成・指定、実装、設定変更、実測、試験、build／梱包／展開、外部照会・閲覧、実接続・実通信、コミット、公開・Pushは行わない。数値・観測手段・保全方式・保全先は未承認のまま。
