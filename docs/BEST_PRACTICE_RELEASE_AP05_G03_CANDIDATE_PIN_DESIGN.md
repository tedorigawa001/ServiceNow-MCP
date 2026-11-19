# AP05 G03：同一候補の固定項目と段階別pin

Version: release-ap05-g03-candidate-pin-draft-0.1 / Date: 2026-11-20。

Status: **設計のみ。G03は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `3aaaf52` は本文の参照元で、候補revisionではない。実体のpin・候補の生成・採取は未実施。

[AP05候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)のAP5-G03「同一候補」を、[共通受入設計](BEST_PRACTICE_RELEASE_AP05_PK01_PK04_CANDIDATE_ACCEPTANCE_DESIGN.md)、[固定slot／変異manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)のSL01〜04、[証拠受入設計](BEST_PRACTICE_RELEASE_AP05_UNRESOLVED_EVIDENCE_ACCEPTANCE_DESIGN.md)のEV01／02／03／07に結ぶ。[通常並列対照の依存pin設計](BEST_PRACTICE_WFB_SGA_DEPENDENCY_PIN_CONFIG_DESIGN.md)からは宣言・実体・実解決の分離だけを参照し、対照の時間値・環境・取得手段は移さない。旧試験H、候補配布物P、開発側Dの成果物・依存・実行結果は別にする。

先行AP03の未コミット差分5ファイルと旧試験を保持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・依存解決や起動を伴う実確認・設定変更・実接続・実通信・公開・コミット・Pushは行わない。

## 1 何を固定するか

pinは、承認された指定と実際に使う対象を、同じ系列／slot／attemptに結び付ける証拠。基準資料、期待する対象、観測した対象、使用時の照合、終了時の再照合を別欄にする。申請時の指定と実体の記録を同一視しない。

| 対象 | 固定する項目 | 代用できないもの／起動0 |
|---|---|---|
| 候補commit／tree | 完全commit ID・対応するtree ID・承認対象の変更範囲と除外条件、専用source rootと実際の入力manifest。buildに渡る設定・素材を承認対象へ結び、例外の外部入力は別の固定欄に置く | branch名、短縮ID、作業ツリーの見かけの一致だけでは不足。未コミットAP03・未承認の生成物・別worktree・入力に混入する未追跡／無視ファイルは採用しない。候補不明ならSL01、指定と実体の不一致ならbuild起動0 |
| 検査器／固定plan | 候補とは独立した検査器の版・実体digest・由来、固定entry・subcheck・所定判定ID／理由・slot順・MT行、各起動のargv／作業root・pre/post照合点。検査器自身の依存も供給区分を分けて固定 | 候補側の自己申告、別版、後付けのentryや理由変更を採用しない。所定判定と検査器の失敗は別。対象／版／entryが未確定なら該当slot起動0 |
| 入力／fixture・設定 | 固定入力manifest、fixtureの相対位置・版・内容digest、package宣言／lock、build設定と適用先、CLI／許可した環境入力・module条件。配布payloadと検査用添付物のmanifestを分ける | fixture／lockを持ち込んだ実行結果で、配布物の同梱内容を水増ししない。宣言を読んだだけで設定の実効値を確認済みにしない。未承認の設定評価・秘密の値の収集・起動前の設定変更は対象外 |
| Node実体／起動chain | 所定のNodeの解決経路、link列と最終実体、file種別・byte長・内容digest、Node版・platform／architecture／関連ABI、実際の起動binaryとの照合。使用するwrapper／package manager／compiler／展開用toolも必要な実体・依存・起動条件を固定 | version／`PATH`の表示だけで同一にしない。別Node／tool・実体差・由来不明のloader／preload・未承認の暗黙起動があれば該当起動0。確認のための別起動やhookの追加は自動許可しない |
| 依存の宣言と供給実体 | 宣言・lockのversion／integrityと、許可済みローカル依存の内容manifestを別に固定。build用／候補本番用／検査器用を区別し、必要なnested／optional／platform別依存、実行するhelper・native addon／resourceも対象 | 同じversionやlockのintegrityだけで展開後のbytesを証明しない。許可範囲外の共有可変root・未固定の依存・読めない実体・隠れたhelperがあれば該当起動0。依存不足をその場で補わない |
| 実解決先 | 必須の解決ごとに、起点entry／importer、specifier、module方式・条件、許可root、link解決後の実file／内容pinを同じslot・attemptに結ぶ。runner／child／workerも別記し、builtinは同じNodeの証拠に結ぶ | 静的な解決候補、実解決、実loadの観測は別。repo直下での一括resolveや名前検索だけで済ませない。許可外の実解決、必要な動的辺の未確認、実体不一致なら当該／後続起動0 |

内容manifestの比較単位は、許可rootからの一意な相対位置、種別、byte長、raw bytesの内容digest、実行に関係する属性、linkの参照と解決先。比較順・符号化・digest方式・件数／bytes／読取回数の上界は実施前に別途固定する。重複・別名衝突・root外参照・読み取り不能は無視しない。前後の一致だけでは使用中の差替えを否定できないため、書込み所有と不変に扱える根拠を要求する。digestは同bytesの比較用で、供給元の真正性・安全性・実行許可の代わりではない。

実行前に必要な実体・解決先は、その段で別途承認され、効果と費用が限定された方法で照合する。実動作でしか分からない解決／loadは、固定済みの供給と許可範囲に閉じられることを先に示し、当該の承認された起動で照合してから結果を次段へ渡す。起動前に必要な証拠が実行しないと得られず、先行する限定確認にも承認・隔離・停止根拠がない場合は起動0。観測のためのwarm-up、別resolver、loader差替え、監視設定変更を暗黙に加えない。

静的に読める[package宣言](../package.json)・[lock](../package-lock.json)・[build設定](../tsconfig.json)は版・設定・配布候補の指定材料。[PK01](../tests/review/package-canonical-budget.mjs)と[PK02／03](../tests/review/package-http-classification.mjs)のdry-run一覧とrepo `dist` の旧compiled実行は、同じtarballを展開して得た実解決先ではない。[現行PK04](../tests/review/package-worker.mjs)は展開後にlockを添付して `--prefer-offline` で依存を準備し、fixtureも別途添付する。その記述は、lock／fixtureが配布payloadに含まれる証拠にも、通信なし・承認済み依存供給の根拠にもならない。いずれも今回の起動手順には流用しない。

## 2 段階別pinと起動0の境界

同系列で、承認済み指定 → 実入力 → このbuild → このtarball → この展開payloadへ一方向に結ぶ。各段の前に既存pinと前slotの完全終端を照合し、段の後に生成された証拠の由来・内容・終了を固定する。後段で初めて生成されるdigestは前段に要求しないが、その段の出口では必須。

| 次の段階 | 起動前に必要なpin／実体 | 当該段の出口で固定するもの | 不一致／未確認時の起動0 |
|---|---|---|---|
| SL01／先行保持（SP01） | G01／G02の審査と許可、候補指定・固定plan・対象集合、G04の同系列保持枠／時間予約／責務。最初の副作用の前に `T0` を確定 | 承認済みの範囲内で候補commit／tree・実入力／検査器・起動chain／Node・build用依存を照合し、系列の先行保持と結ぶ。後段に使う供給指定も固定 | 候補指定・承認・保持枠・予約不足でSL01起動0。先行登録の応答不明・pre-pinの不一致はbuild以降0。枠の不在と決めつけず再登録しない（FP01） |
| SL02／空build（SP02） | SL01の受渡しと終了、同source／設定・toolchainと許可依存・実解決境界、同系列が所有する**空の専用出力**。既存distは流用しない | 同build attemptの出力manifest。packで使う出力をパス・種別・属性／bytesで固定し、許可された入力・使用した実体と結ぶ。通常終端とpost-pinも必要 | 旧出力の混入、設定／依存／出力先の不一致、空の証拠不足はbuild起動0。部分生成・完了未確認・manifest不一致はpack起動0（FP02） |
| SL03／pack（SP03） | SL02の終了と同build出力manifest、梱包対象ルール・固定tool・許可された付随ファイルと出力先、元入力／出力のpost-pin照合 | 転送する一つのtarballのraw bytesのdigestと一覧・長さ、同build manifestからの梱包対象との対応。`package.json`／bin等の付随物も対象。dry-run一覧やpackage名だけでは代用しない | 別build、出力drift・対象外の混入、無承認の再build／script起動を要するならpack起動0。tarballの由来・内容・終端が未確認なら展開起動0 |
| SL04／隔離展開（SP04） | SL03の終了、同tarballのdigest・一覧と由来、空の隔離先、候補本番向けの承認済みローカル依存供給・添付ルール | 同tarball由来の展開payloadを**添付前**にmanifest化し、tarball内の各対象との対応を確認。依存／添付の別台帳と、許可root内の実解決先を結ぶ。添付後も元payloadのpinと通常終端を確認 | tarball差・隔離不足・許可範囲外に展開される／一意に照合できない対象は展開起動0。展開後の不一致・依存不足・未解決・添付混入ならP+起動0。別dist・ソース／tsx・隣やglobalの依存・registryへfallbackしない |
| P+／P0、続いてPΔ | P+／P0は同じ未変更の展開payload・実解決先と独立検査器／fixture。PΔは全P+／P0の所定判定と終端後、同元候補pin・固定MT行・新しい一変異一copy | 各slotのpre/post-pin、所定判定、独立終端。PΔでは元候補と別のbefore／after・単一差分を確認し、指定判定へ渡す。変異artifactは実行しない | missing dependency／一般起動不能をP0の不在にしない。元候補のdrift、copyの掛け違い・差分不明は該当判定／後続起動0。失敗したcopyの使い回し・再試行なし |

pack側の一覧と展開側のmanifestを照合するとき、archive内の位置と隔離root下の相対位置の対応、許可されたmetadataの差、内容差を区別する。pathの正規化で別名衝突・root外参照を隠さない。配布payloadの正規manifest、ローカル依存のmanifest、検査用添付台帳は互いに上書きしない。

## 3 不一致時に止める範囲と保留する証拠

- **起動前の不足は次段起動0。** すでに必要なpinの欠落・不一致、承認範囲外の参照、前slotの終了未確認は後段で補完しない。将来の候補変更・検査器の変更・作り直しは別系列として再審査し、旧結果を持ち越さない。未生成の後段pinだけを理由に先行段を拒否することもしない。
- **起動後に判明した差は、新規起動を閉じる。** 実解決／loadや出力のdrift、部分生成、照合不能時は最初の理由・最後に照合できたpin・消費済み／未到達／未確認と残存責務を分けて保持する。[操作site・失敗prefix](BEST_PRACTICE_RELEASE_AP05_OPERATION_SITE_FAILURE_PREFIX_DESIGN.md)のFP01／02／07／11／12と[外側時間枠・cleanup予約](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_OUTER_BUDGET_CUSTODY_DESIGN.md)に従う。[費目・上界](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_COST_UPPER_BOUND_DESIGN.md)の通常pin・引継ぎ費で消費済みの操作をRで再計上せず、停止後に別途必要なR4棚卸し等は事前予約に計上する。後始末は同系列に事前承認された予約・権限の範囲のみ。安全に照合できないものを不在や空とみなさず、未終端・借用未退役・保全未受理の対象を削除しない。
- **候補・数値・方法を埋めない。** 独立検査器の版・固定entry・依存の実供給・実解決／loadの観測手段・読み取り上界・保全方式／保全先は確定していない。[限定対照の承認票案](BEST_PRACTICE_RELEASE_AP05_STATIC_GAP_LIMITED_CONTROL_APPROVAL_DESIGN.md)のQA01／02が後日承認されても、実候補のpinや候補検証の承認とは別。G01／G02／G04を代替せず、現時点はSL01から起動0とする。
