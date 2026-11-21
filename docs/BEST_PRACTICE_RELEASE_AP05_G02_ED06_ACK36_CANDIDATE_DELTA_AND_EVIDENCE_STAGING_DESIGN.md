# AP05 G02：ED06／ACK-36 候補差分と起動前／起動後の証拠

Version: release-ap05-g02-ed06-ack36-candidate-delta-and-evidence-staging-draft-0.1 / Date: 2026-11-20。

Status: **差分と証拠の段階を分ける設計案。ED06の代替条件と入場条件を満たした候補の起動は承認済み。候補未指定・G01〜04の入場条件未充足・SL01起動0・公開保留。** [採用・起動承認記録](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_ALTERNATIVE_ACCEPTANCE_PROPOSAL.md)の承認を引き継ぐ。起動の再承認は求めないが、起動条件の変更・AP02本体適用・旧保証の処遇まで承認されたとは扱わない。

## 1 候補差分に入れる案と、入れないもの

[AP02の範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)と[ED06の差分案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_CANDIDATE_SCOPE_AND_ENTRY_DESIGN.md)に従う。次の「入れる」はED06の差分審査対象であり、候補を生成・指定する決定ではない。

| 差分の扱い | 境界と審査条件 |
|---|---|
| 入れる案：S03の旧synthetic専用分岐 | `src/servicenow/bounded-read.ts`の旧synthetic overload、`PreparedSummary`、`#prepareCompositionIO`への到達辺。AP03で採用済みの外側受付で、禁止own `synthetic_io` はsnapshot／policy・生成より前に同期拒否。通常の同期準備と許容optionsは維持 |
| 入れる案：S05とS07の旧専用参照 | `pinCompositionFakeIO`と旧fake I/Oの実行・型参照、配布時の専用JS・宣言・両map、旧ack／capture・時刻引渡しにだけ属する継続・後始末。S04に触れる参照は、呼出し元・所有者・例外時の解放先を示し、旧専用と確認できた分だけ。共有か未解決なら変更しないで差分審査を止める |
| 必ず残す：K01〜04の通常経路 | 通常factory・2引数source・同owner／ready／Permit／port、既存のrelease観測とfallback、登録→`matched`→metadata guard→取得、初期結合と単一会計・元予約、先行理由・取消・rollback・close・解放。共有bootstrap契約、canonical予算、通常観測・時計、他のrelease値moduleは旧専用扱いしない |
| 今回のED06差分から除外 | SA／NDのfriendやED01〜05・07の専用入口、未承認のC07宣言・JS境界変更、通常adapter／worker・公開出力、検査依存の配布物への混入、新friend・公開getter・loader差替え。旧試験の注入位置・期待値・元deadline・並列度、実通信・設定、公開手順は変更しない |

隔離試作は差分審査の入力に限る。試作側で旧時刻／取消の4件が通らず、別の基準版では元のACK／receiptを含む旧試験42件が成功した。したがって旧試験の開発側分離を恒久採用済みとは扱わず、旧Promise拒否や時刻・取消の未代替保証を個別に保持する。AP02本体適用の承認には、変更ファイル・切る辺・残す共有辺・元assertionごとの影響・旧試験の継続方法を添える。ED06だけの差分で限定リリース全体の候補が揃ったとはしない。照合時のHEAD `32a24ae` と未コミットの隔離試作は候補commit／treeに流用しない。

## 2 起動前に必要な根拠と、起動後に初めて得る証拠

| 段階 | 起動前に揃えるもの | 当該段で得るもの／欠落時 |
|---|---|---|
| 系列開始の審査（SL01より前。副作用なし） | G01：承認済み差分と通常経路の対応、候補commit／treeの指定。G02：影響する旧保証の個別処遇と保持、今回の起動許可、①〜③の取得範囲・採否／停止条件。G03：ソース・入力・検査器／fixture・Node／依存の固定対象と段階別照合手順。G04：固定slot・隔離・終了四軸・保全、通常枠／cleanup予約の承認と担当 | 審査記録まで。候補実体の採取・hash、先行保全登録や領域確保はまだ行わない。一項目も推定で埋めず、特に対象差分・旧保証の処遇・実行条件が欠ければSL01起動0 |
| SL01〜04：準備・生成・隔離展開 | それぞれの段で必要な既生成pin、直前slotの終端、保全の受渡し・残時間。未生成成果物は生成方法・所有・照合・不一致時停止を先に固定 | SL01で入力と先行保持、SL02で空build出力、SL03で同buildのtarballとdigest、SL04で同tarballの展開manifest・実解決先。**未生成のdigestを入場前の実績にしない**。引渡し時に必要なpin・終了が未確認なら後続0 |
| ① 展開後の構造照合 | 同展開と実解決先・独立検査器の版、許可された読取対象とslotを指定。現行TS用の検査器の成功を候補JSに流用しない | 実解決された通常entryから登録確定・拒否短絡・同Permit guardの順を、観測／fallbackの両方で照合。別名や転送の到達先が不明・迂回辺ありなら不合格。実行の起動は別判定 |
| ② 通常正対照と③ 同実装のowner欠失対照 | ②は[固定manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)のSL09相当の範囲で別立て。③に割り当てるslot・許可・費目は未承認で、SL09やPΔに自動割当てしない。固定entry・入力・独立期待値、同実装、非介在、前slot終端、予約を先に確認 | ②は同候補の実bind、最初のmetadata、会計・停止・解放。③は同候補のowner実装を使用した別の合成runで登録済み／欠失／期限等号を区別。全てのpost-pin・所定判定・終了を別々に確定。③を通常adapterでの直接欠失とは報告しない |
| 判定・公開審査 | ①〜③の証拠と未観測部分、旧保証の処遇、他のAP05検査の所定結果と終端 | ①〜③すべてが同候補に結び付いたときだけED06の通常経路を採否判定へ送る。候補での旧Promise互換や、未観測の直接欠失runでの取得・dispatch・解放を確認済みにしない。G02全体の充足やAP06の公開は別判定 |

## 3 起動条件の変更が必要な場合の境界

[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)・[段階別pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)・[終了と保全](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)は変更しない。候補生成後にしか得られない①〜③を、取得予定だけでG02充足としてはならない。現行入場条件のままでは必要な証拠取得に進めない場合は、**入場前の許可・所定の事後判定を分ける限定検証枠**の提案を別に審査する。その場合も許可slot、対象候補、隔離・期限・停止と保全、後続不許可を特定し、証拠取得を保証回復や公開へ自動でつなげない。既存slot順を飛ばすことや、観測手段・保全方式・数値／保全先の仮決めは認めない。

次の承認対象は起動そのものではない。まず **ED06の候補用差分を準備する範囲（AP02）と、旧保証・旧試験を保持する条件**を個別に確定する。本体への適用、旧試験の切替、限定検証枠の追加は必要に応じて別判断。その間はG02未充足・候補未指定・SL01起動0。正式発行口閉鎖・全体受付無効・Unknown・調査保留・閲覧0を維持する。本MD追加のみで、候補の生成／起動・実装・実測・試験・梱包・実通信・コミット・Push・公開は行わない。
