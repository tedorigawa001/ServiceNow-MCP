# WF-B：固定辞書の供給・期待値更新・同SourceMapDraft結合の差分設計

差分設計追記（2026-11-08）: [scratch受理区間・進行位置・候補確定点](BEST_PRACTICE_WFB_SCRATCH_CANDIDATE_DESIGN.md)へ、同bytesの受信／hash計数・同scope候補の一度限り受理・確定後の停止診断と独立検証条件を整理した。独立合成(B)向けの設計であり、当該MapSupplySnapshotへの読取接続、実期待値pin、実source照合、5 gapsの確認を進めたものではない。

実装追記（2026-11-08）: [private読取設計の(A)純粋fake](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)に共有上限・停止・単発ReadOps・結果slotを実装した。独立assemblyのみで、当該供給元／MapSupplySnapshot・bytes／hash・実sourceには接続しない。未実装行・5 gaps・Unknownは維持する。

詳細設計追記（2026-11-07）: [private読取継続・共有上限・同bytes hashと結果owner](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)で、同snapshot借用・単発ReadOps・全file共有上限・cleanup予約・候補のpost受理と独立合成条件を具体化した。設計のみで、実期待値pin・読取／hash実装・実source照合は進めていない。

Version: draft-0.3 / Date: 2026-11-07 / 読み取り照合基準HEAD: `89fa53a` / レビュー修正の基準HEAD: `5d7b410` / 合成供給実装基準HEAD: `545f044`。

draft-0.3: §9の合成固定供給元・MapSupplySnapshotとprivate結合を実装した。実辞書・期待値レビュー・内容hash検証の計画は実施済みにしない。[検証記録](E2E_BEST_PRACTICE_WFB_MAP_SUPPLY_2026-11-07.md)。

draft-0.1のレビュー修正: DS02とDS08は公開の入口から到達できないので、試験専用の第2合成セットでのみ確認すると明記した（§4、§7）。`reviewSetId`の更新忘れは検出できず、レビューに頼ると書き足した。採用までは内容hash照合を既定の`npm test`から外す方針とした（§3）。「必須file」を採用した固定セットの全fileと定義した。設計のみで、実装状態は変わらない。

Status: **合成固定セットとprivate結合だけを実装。実辞書の供給・期待値pin・内容hash照合は未実装。** 親は[固定source対応・純粋値検査契約](BEST_PRACTICE_WFB_FIXED_SOURCE_COVERAGE_DESIGN.md)と[固定schedule／carrier設計](BEST_PRACTICE_WFB_SCHEDULE_CARRIER_SEED_HANDOFF_DESIGN.md)。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。draft-0.1／0.2はMDだけ、draft-0.3は§9の合成実装に限定する。実sourceのhash採取／照合・実期待値pin・S発行・core接続・実接続・実通信・設定変更・Pushは行わない。§9以外の型名・固定module・検査点は将来案で、発行済み証拠ではない。

## 1 既存契約からの差分

| 境界 | 現在 | 追加する契約 |
|---|---|---|
| 辞書の供給 | `inspectSourceDictionary`が未信頼の合成DATAを検査 | 開発専用の単一固定供給元から、レビュー済みの期待値と行を組で供給 |
| 期待値 | 合成hash／byte長の形式検査だけ | raw file bytesを対象に候補を作り、別確認とレビューを経て静的にpin。検証時にactualから作らない |
| SourceMapDraft | 任意のfiles／rowsをstrict検査し、copy／freeze | 同じ固定セットのfiles／rowsを1回の検査で確定し、その返値を同じprivate snapshotが保持 |
| 同一性 | 値の適合であり供給元を証明しない | 別snapshot・別版・同値copyを供給元結合として採用しない。値検査自体のcopy受理は変更しない |
| 未実装行 | missingを保持して値として受理 | 実辞書をpinしてもmissing／statusは自動変更しない |
| 結果 | hash not_checked、mapping shape_only、implementation unknown | 供給の結合が成立しても同じ非実行・未確認状態。後続のhash／意味検証へ勝手に昇格しない |

現行`wfb-source-map-draft-values-1`や既存19項目plan、carrier値、K0/E fakeを変更しない。今回の設計で実E／S要求量は導出しない。

## 2 固定供給元と信頼境界

将来の開発専用固定moduleが、非公開の期待値辞書とSC01〜12の行DATAを同じ静的セットとして所有する。供給moduleの具体pathと実装は次工程でレビューする。runtimeの設定・環境変数・CLI引数・ユーザー指定ファイル・glob・外部取得から選ばない。外部の`register`／`replaceDictionary`／`fromSummary`／任意supplier callbackは作らない。

初期の対象候補は親設計§2のF01〜F04・O01・T01〜T05である。対象集合を独立の棚卸しで確認してから採用する。存在する10ファイルというだけで依存先・試験の網羅性を確認済みにしない。辞書外のnode:util／標準library・toolchain・native実装は別の未確認範囲で、当該10ファイルのhashからそれらの同一性は証明しない。

供給元の完全性はコミットのレビューに依存する。static／private／freezeのいずれも、信頼された署名・実行permitや改ざん耐性の証明ではない。sourceと期待hashを同時に不適切に更新すると内容照合だけでは検出できないため、差分レビューを省略しない。

対応記録・期待値を埋め込む供給module・検証器自身は、自己参照する期待hash集合に含めない。新しい採用試験やoracleが期待値記録へ依存する場合も、hash依存関係を棚卸しし循環を作らない。除外対象はレビュー範囲から除くのではなく、内容hash照合で保護されない基底として明記する。自分自身のコミットhashや生成後hashで穴埋めしない。

K0前に起きる供給module初期化・DATA構築・freeze・選択の費用と故障はUnknownである。未取得Eへ後着課金しない。固定供給の成立を確認するまで、実bootstrapで使える供給元とは扱わない。

## 3 期待hash／byte長の初期固定

以下は将来の作業手順であり、今回実施しない。

1. 対象file ID・path・roleと対象bytesの範囲をレビューで確定する。ID順はF、O、Tを含む文字列昇順。IDを無関係な別ファイルへ使い回さない。複数fileの行ではhelper・呼出し点・module初期化も棚卸しする。
2. 内容を変換せず、raw bytes全体から候補SHA-256とbyte長を算出する。改行・BOM・コメント・末尾を除かない。Git HEADは調査基準として記録できるが、期待hashの代替にしない。
3. 候補の生成とは別の検証経路で、対象path／file種別・bytes・長さ・digestを再確認する。期待値を供給する本体と同じhelperがactualとexpectedを同時生成するだけでは不可。別ツール等の具体手段と信頼範囲は、導入前に明記する。
4. レビュー記録へ対象集合、候補と再確認の結果、差異の有無、関連SC・test／oracle・missingを残す。差異があれば採用しない。
5. 採用判断が明示された値だけを固定セットへ格納する。検証実行はこの静的なexpectedを読むだけで、実行時のactualから上書きしない。レビューが未完了の候補を既承認セットとして提供しない。

現時点では実期待値を採取・承認していない。したがって「未pin」の開発上の状態を、hashが0の辞書や空配列として完成供給しない。現行純粋検査が空辞書を受理することは、実固定セットの採用条件ではない。将来の固定供給は、採用した固定セットの全fileのうち1つでも未pinなら非供給とする。合成セットは別の非実行試験として区別し、実セットの代役にしない。

採用までは、内容hash照合を既定の`npm test`（`tests/review/*.test.ts`を含む）から外し、別の設定で明示的に実行する。対象ファイルは頻繁に変わり、既定に入れると変更のたびに再レビューまで全体の試験が失敗するためである。`tests/transport`を既定から外して`vitest.transport.config.ts`で実行している先例に倣う。合成セットだけを使う試験は、この制限の対象外である。

checkoutの改行変換を止める`.gitattributes`等は親設計の未実施要件として残す。適用は設定変更を含む別作業であり、本書では行わない。設定と実bytesの範囲が未確定なままクロス環境の再現性を保証しない。

## 4 同SourceMapDraftへのprivate結合

将来の`MapSupplySnapshot`は、固定セット版を示す`reviewSetId`と、同セットのfiles／rowsを1回の`inspectSourceMapDraft`で検査した成功返値だけを非公開に保持する。`reviewSetId`は手動で改版する有限の管理名で、内容hash・署名・invocation identityではない。内容と結び付かないので、期待値を変えて`reviewSetId`の更新を忘れても検出できない。更新の漏れはレビューで止める。既存SourceMapDraftのstrict fieldへ追加せず、供給側wrapperのmetadataとする。

1. 供給元が同版のfiles／rowsと既存modelを選ぶ。外部から別の辞書・行・版を渡せない。
2. files／rowsをまとめて検査する。`inspectSourceDictionary`単体の成功と別由来の行を後から貼り合わせない。失敗・部分生成ならsnapshotを供給せず、部分参照を固定破棄する。raw例外は外へ出さない。
3. 現行検査は入力をcopyするため、結合の基準は元DATAではなく**同じ成功返値の`value`とその`value.files`／`value.rows`**に統一する。元の辞書配列と参照一致しないことを異常扱いしない。
4. 後続の開発専用検証が使う辞書と行は、同snapshotからまとめて取り出す固定継続だけに渡す。別snapshotの同値辞書、外部で再構成したmap、古いreviewSetIdと新しいmapの組を採用しない。独立したpublic引数から再結合する入口は設けない。
5. 検証後の結果も、同snapshotと対象file／rowのIDへ結合して保持する。数値や公開summaryからsnapshotを復元・採用しない。実hash照合の結果ownerや安全読取の詳細は後続設計とする。

このbindingは、開発検証の別セット混入を防ぐ内部契約であり、S・record・budget・runtimeの権限ではない。DATAである現行純粋検査にone-shot claimや所有移動は追加しない。必要性が未確認の新しい一度限り台帳を作らず、供給snapshotの参照結合とcredit移譲のclaimを混同しない。

供給元は静的な1つのmoduleで、snapshotを受け取る公開入口もない。したがって1回の実行の中に、別snapshot・同値copy・新旧の固定セットが現れる経路はない。以下と§7のDS02／DS08は、試験専用に組み立てた第2の合成セットでだけ確認でき、公開経路からの到達の証拠にはならない。

固定セット更新時に既存snapshotのfiles／rowsを差替えない。進行中の検証は同じ不変セットを使い切るか、その検証を停止し、新セットでは新しい検証として始める。新旧結果を合流しない。これは長期実行runtimeの更新APIを設ける提案ではない。

## 5 更新・レビュー責務

| 役割 | 確認と記録 | 単独では決められないこと |
|---|---|---|
| 変更起案 | source差分・影響するfile／SC／step・期待値候補・理由・missingの変更案を列挙 | actualに合わせるだけの自動採用 |
| 別経路の照合 | raw bytes・byte長・digest・対象集合を再確認し、生成経路との独立性と結果を記録 | sourceの意味や費目上界の完成宣言 |
| 対応関係レビュー | helper等の全影響行、symbol／site／phase／費目所有・test／oracle・全prefixの変更を確認 | hash一致だけによるmissing削除 |
| 採用判断 | 上記差分・確認結果・残るUnknownを読み、固定セット版と採用範囲を明示 | S発行・ready化・正式発行口や全体受付の有効化 |

担当者・独立確認手段は未割当／未承認で、今回の文書作成を採用判断に数えない。同じ人が複数役割を担当する場合はその事実を記録し、別人レビュー済みと称さない。手順／計算経路の独立性と人の分離は別の条件である。担当者への連絡や外部承認サービスは追加しない。

source内容・path・role・依存helper・test／oracleが変わったら、該当fileと全参照行を再レビューする。共通helperは参照元すべてを確認し、同じhashが残った主fileだけ見て更新を閉じない。path変更や削除・ID追加は集合差分も確認する。file内容が同じrenameでもpath bindingは更新対象になる。

採用する変更では固定セット版を更新し、期待hash／byte長・行・試験参照・変更記録を同じレビュー範囲でそろえる。model／意味契約が変わる場合は既存modelのまま別意味にせず、別途版移行を設計する。hash mismatch時に自動更新・旧版fallback・追加ファイル探索をしない。過去の検証記録は上書きせず、対象の版を残す。

## 6 未実装行と確認軸

初期セットは親設計§3の既存参照表を出発点とする。新bootstrapに未採用のF01等を、ファイルが存在するだけでimplementation bindingにしない。SC06／SC07／SC09など実施点のない行は`unimplemented`とmissingを保持する。既存fake・値検査を参考にできる行も、新固定供給経路の実施点がなければ`partial_reference`としてmissingを残す。

missingを削除するには、実施点・全必要file・費目所有・成功／拒否／部分prefixと独立試験の変更根拠を別レビューする。期待hashの更新・全hash一致・純粋検査成功・test件数増加は削除の根拠にならない。実施点の検証方式とgapsを緩める条件が未設計の間は、`mapped_unverified`の先へ進めない。

供給に成功しても`hash=not_checked, mapping=shape_only, implementation=unknown`を維持する。将来の内容照合では、hashの一致とimplementation非成功を別々に報告する。空bindingの行はhash not_applicableで、空集合からhash_matchを作らない。実coverage・native費・実E／S要求量はUnknown、既存5 gapsはすべて保持する。

## 7 将来の合成受入条件（未実施）

- DS01：固定供給元以外のdictionary／rows／model／reviewSetIdの注入、任意path・外部supplier登録を拒否。供給元自身のレビュー範囲と梱包除外を別確認する。
- DS02（試験専用の第2合成セットでのみ確認）：1回のmap検査が返した同value／files／rowsを基準とし、元入力とのcopy差は許すが、別snapshot・同値copy・別版・filesだけの差替えを結合として拒否する。
- DS03：実期待値が未pin／不完全なら供給しない。0hash・空辞書・fakeの5 unit・既存summaryを完成供給に使わない。合成セットの成功から実セットへ昇格しない。
- DS04：複数fileのhelperだけ変更、path rename、role変更、test参照変更を独立の集合oracleで検出。辞書からexpected集合をそのまま読み、同じものをexpectedにする試験だけでは不可。
- DS05：候補と別確認が一致しない場合の非採用、期待値とsourceの同時不適切更新をレビューで止める条件、旧記録の保持を確認する。暗号学的に改ざんを検知したとは呼ばない。
- DS06：部分生成／map検査失敗でprivate参照を固定破棄し、後続へ部分snapshotを渡さない。最初の固定拒否診断を保持し、本文・raw例外を出さない。
- DS07：未実装行のmissing・status、hash／mapping／implementationの別軸、5 gaps・ready=false・Unknownを保持する。hash成功時にもS／core／実I/Oを呼ばない。
- DS08（試験専用の第2合成セットでのみ確認）：新旧snapshotの混合・古い期待値のfallback・自動hash更新を拒否。改行変換の扱いと安全読取は別の未実施条件として残す。

供給境界はまず合成セットだけで検証する段階を分ける。その後の実source候補算出／pin／照合・改行設定は別の明示承認を要する。上記試験を今回実行した記録はない。

## 8 今回の確認範囲・残課題

`89fa53a`の純粋検査と親設計を読み取り照合し、差分設計と親2文書の参照を追加した。ローカル文書参照・空白・変更範囲だけを確認する。code／test／CHANGELOG／設定は変更せず、build・合成試験・実source hash照合は実行しない。

固定供給snapshot・期待値作成の独立手段・具体担当・実セットの採用、bounded安全読取・hash検査、実施点の意味照合・全費目oracleは未実装／未承認である。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

上記はdraft-0.1時点の記録。今回の合成実装範囲は以下と検証記録に分離する。

## 9 合成固定セット・MapSupplySnapshotの実装境界

`tests/review/fixtures/source-map-supply-fake.ts`を追加。importは既存の純粋`inspectSourceMapDraft`だけで、実source・fs・crypto・runtime・K0/E fake台帳を使わない。固定recipeはsynthetic配下の4 file（F01／F02／O01／T01）、長さ10と模擬64桁値、SC12行。SC01は2 fileへのreference_onlyを持つpartial_reference、残り11行はunimplementedで、各行にactual_producerというmissingを残す。親の実10ファイル辞書ではなく、実期待値pinではない。

通常factoryは外部map／files／rows／版／supplierを受け付けない。引数があれば、その内容を読まずsupply_invalidで停止する。正常時は同recipeのmapを1回検査し、その成功返値valueを新しい非公開MapSupplySnapshotへ保持する。MapSupplySnapshotとSupply classはexportせず、同一性の保持は各ownerのprivate fieldだけで、global台帳・登録口はない。

同snapshot・synthetic-map-set-1・同value・同value.files・同value.rowsがそろう場合だけprivate acceptを通す。snapshot／map／配列の同値copyと、copy前の元入力はcanonicalとして採用しない。pure値検査のcopy／freeze自体はそのままで、新しい権限やclaimを追加しない。

facadeはcheck／close／inspectだけで、map・辞書・snapshot・hash本文・adopt口は出さない。checkは固定の非実行継続による結合確認で、hashや意味検証を呼ばない。正常時のreadonly再確認は許し、one-shot claimは作らない。closeはprivate参照を1回だけ論理退役させ、終了後checkはsupply_closedで拒否する。close自体は反復可能だが二重退役しない。

binding拒否または生成失敗では最初のsupply_invalid／binding_mismatchを保持し、owner内のsnapshotと試験用元入力参照を退役する。以後のcheck／closeは先行理由を返して再開しない。正常close後の拒否は正常終了の診断を後から上書きしない。logicalRetirementsは当該ownerの参照退役回数で、物理解放／GC／ゼロ化の証明ではない。

createFixedSyntheticMapSupplyは有限scenario名だけを受ける合成probe factory。未知名・余分引数は正常へfallbackせず、DATA構築前に拒否する。通常継続とprobeは同じprivate acceptを通る。別snapshot、canonical mapを持つ別wrapper、再検査したmap copy、files／rowsは正規のままmap objectだけを変えた`map_wrapper`、files／rowsだけのcopy、第2mapのfiles、元入力、版文字列の混入を内部だけで作る。第2セットはhelperの模擬path／byte長を変えたcontrol DATAで、synthetic-map-set-2は混入対照だけに使い、正常供給する別の承認済み版にはしない。

DS02／DS08の拒否は、試験専用copy／第2セットの内部対照によるもの。通常の公開facadeにはsnapshot／map引数がなく、外部からその混入へ到達した証拠ではない。reviewSetIdと内容はhashで結合していないため、内容を変えて版更新を忘れる問題は検出せず、引き続きレビューで扱う。実hash照合を既定のnpm testへ追加していない。

固定故障はDATA準備後、map拒否、snapshot生成後の3境界。snapshot生成後の故障では同snapshotを退役してから拒否する。probe内の一時foreign snapshotもfinallyで退役する。任意fault callbackやprototype破壊は使わず、native allocation／freeze内部の全故障は未検証。inspectのmapChecksは当該供給mapの検査回数で、negative probeがcopy／foreign候補を準備する追加純粋検査は含まない。全費用・native費は未計量のまま。

全返値はsynthetic=true、realPins=not_supplied、authority=none、ready=false、hash=not_checked、mapping=shape_only、implementation／runtimeCoverage／nativeCost／entryRequirement／seedRequirement=unknown、coreInvocation=not_calledに固定。供給の成功は実セット採用・レビュー・内容hash一致・missing解消を意味しない。DS01／DS02／DS06／DS07／DS08の合成境界部分だけが対象で、DS03の実未pin管理、DS04の実source集合、DS05の期待値レビューは未実施。実供給・hash検証・意味対応・S／core接続は閉鎖のまま。
