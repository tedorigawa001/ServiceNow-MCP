# WF-B (B)：root先行scalar・BP00〜01正規source生成／確認・同期停止

Date: 2026-11-11 / 基準HEAD: `311d3ef` / 未コミット差分の合成検証。

対象は[生成・停止設計§12 draft-0.3](BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_STOP_DESIGN.md)、[bind親§13](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)、[構築親§17](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)。開始時の作業ツリーはクリーン。[(A)の最小分離](E2E_BEST_PRACTICE_WFB_BODY_STORAGE_DATA_SPLIT_2026-11-11.md)と旧field／seed／live／bundle試験を維持する。正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 実装境界

package除外composition fixtureの同CanonicalGateDraftRootへ、生成試行・stage／位置・固定化prefix・初回失敗位置・停止・配送・確認区分の先行scalarと空の返答cache参照を置いた。新しいobject／function／台帳をfield initializerへ生成しない。同start／binding／link／duty／control／root failureと、前工程で分離済みの同BS shellを使う。旧入口の内部順・model・closeは変えず、新しい合成専用factoryだけを追加した。

新factoryは固定string script以外を拒否し、prepare／check／checkLegacy／close／inspectだけを公開する。source・producer・callback・friend・実session等を引数として受け取らない。正常もmodel=wfb-body-source-issuer-1／source_held_unpinned／ok=falseで、実行資格はない。元moduleの開発用export一覧に1件増えるが、配布物のentry／export・package設定は変更しない。

BS00〜14の後、正規shell／同failure・全13carrier未開始／全data参照不在、元base・receiver9空参照／初期scalarを検査する。BP00は試行直前flag→固定plain literal→元issued即時保持の間にhook／await／copyを挟まない。brand＋8metadataの9keyを順にreadonly／non-configurable化し、進行13fieldはwritableなdata propertyとしてsealする。同issuedをcurrentへ捕捉してから、同参照を反射より先に確認し、全22key・属性・関係・Initial値を検査する。BC00は呼ばない。

BP01の確定時だけmetadataConfirmedとstageを進め、元sourceの位置をBP01／afterにする。最終postはこの狭い確認済みvariantを使い、InitialとORで緩めない。後の故障でも確認済み事実を巻き戻さない。元issuedは置換せず、copy／Proxyはcurrent候補だけ。最後のpostでも初回不一致candidateをrejectedへ参照保持する。

source生成試行は一度限りで、producer throw／未捕捉・失敗・closeの後に返却しない。二重private発行はduplicate_creation拒否だけで元sourceを壊さない。正常sourceはinitializing／claim unused、pin／bind／post=false。BS shellはbuilding・13carrier空、receiverはfree／empty・9参照空のまま。root ready・grant・duty消費・body startsは0である。

## 同期停止・保持

新経路のcloseは既存cacheの早期返答より先にroot停止を記録する。metadata未確認のsourceはfieldを読まず、元issued／current／初回rejectedとroot側の有限位置だけを保持する。確認済みの元issuedだけへstopRequestedとfailedを同期反映する。sourceCurrentが別候補でも未知候補へ書かない。失敗だけではclose受理履歴を作らない。

失敗後closeでも、返答は元と同一参照、先行first・初回失敗位置・固定化prefixは不変。同rootとして確認済みのBS shellだけをfailedにし、BS途中の未確認shellを補修／追加検査しない。保持はcleanup完了・解放済みの証拠ではなく、最終discard／borrow退役／root終端は未接続である。

公開projectionはfinite enum／strict boolean、0〜9の固定化数（許可外は-1）、元参照の保持booleanだけ。未確認sourceのstate／claimはunconfirmed、不在はnot_createdとして区別する。root／source／symbol・raw Error／message／stack／任意入力は出さない。sourceDeliveryFirstは予約scalarであり、実配送失敗の検証済み保証ではない。

## RED／GREENと試験側の訂正

最初の正常系はfactory未実装のTypeErrorでRED。正常継続の実装後、故障scriptの未受付、確認済みsourceのfailurePhase／boundary未投影、producer throw script未受付、custodian混入script未受付、重複／失敗後再試行script未受付をそれぞれ観測して追加した。段階ごとに2件、100件、101件、133件から最終200件へ拡張した。途中の同時開始試験2本はどちらもproducer throw未受付の同じ失敗を観測したもので、独立した成功実績とは数えない。

compiledの新しい負の対照で2点を修正した。許可外private値を固定化数へ注入すると文字列がprojectionへそのまま出たため、整数0〜9以外を-1へ制限した。また確認済み直後にcurrentだけをProxyへ置換した最終postでは初回candidateを保持していなかったため、全4検査位置を同じprivate拒否継続へ揃えた。修正後はlate candidate保持・close後のcanonical source停止・未知Proxy hook=0を確認した。

compiled試験自身にも次の誤りがあり、製品コードを緩めず訂正した。

- shape検査だけを外すとgetterが実行されるという期待は誤りだった。progressのwritable descriptor検査もaccessorを拒否する。単独除去ではhook=0を確認し、両検査除去で初めてgetterへ到達する対照に分けた。
- receiverのbodyFieldsInitialは別classにあり、CanonicalGateDraftRootに限定した注入helperではanchorが見つからなかった。正しいmethodの一意な先頭へ固定注入した。
- 二重生成guardを外しても次のpreflightが再生成を止めるため、返答名が変わるという期待は誤りだった。guardがあると元sourceを保つrefusalだけ、除去するとbinding_mismatchで元sourceがfailedになる差を確認する対照へ訂正した。
- 旧body-bind-fields compiledのbodyStarts注入文字列が新projectionにも現れ、一意性assertで停止した。旧inspectBodyBindFields内へだけ注入範囲を限定した。assert・期待値・対照自体は変更していない。

新規対照の仮定／注入先不一致を、製品の退行・期限不足とは分類しない。期限・並列度・製品設定・旧期待値を緩めていない。

## 独立合成・compiled範囲

新Vitestは200件。固定表を本体からimportせず、32点の故障／close／再入をそれぞれ比較する。生成試行・issued／current／metadata確認、9固定化のprefix、root停止とsource反映を別に計算する。BS15段階×4境界の60件では各3modeを検査し、fault／closeではsource未呼出し、reenterでは第2生成なしを確認する。正常／producer throw／各metadata・進行値／extra／prototype／copy／Proxy／getter／欠落／unsealed／frozen、二重発行・失敗後再試行、prepare前後のclose、敵対的引数・5methodへの引数、300未満の凍結公開graphも確認する。

compiledはscratch内だけでemit・注入し、finallyで除去する。ASTでrootの先行18scalarが固定literal初期値でconstructorより前にあり、新しい返答cache参照にはinitializerがないことも確認する。全22fieldの個別関係、candidate同一性2、extra／prototypeと重複getter防御、isSealedの独立witness、metadata9keyのreadonly属性・進行13keyのwritable属性、全13carrierの空状態、元base・shell同参照・receiver初期値、issued即時保持、失敗cache前の停止・canonical反映・未確認source書込み拒否・先行source first・重複拒否、root enum12と固定化数allowlistを対照にする。readonly属性の対照ではguard除去により受理だけでなく後続の禁止書込みTypeErrorへ進む場合も区別する。全属性の全節に単独感度があるとは主張しない。

semantic compile-failはprivate issuer／stopへの外部呼出し2行と、不正build phase／step／boundary／stageの4行を拒否する。readonly metadata等の型保証は旧field compiledを継続する。literal発行経路は固定であり、任意producer／registryが安全という証明ではない。偽metadata参照は固定合成値で、任意の他root private状態を取得／改竄する入口を追加していない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-source-issuer | 200件成功、失敗0 |
| 関連30ファイル | 2,373件成功、失敗0 |
| 新compiled-probe-body-source-issuer | exit 0。先行scalar18・全22field・readonly9／writable13・空carrier13・enum12・semantic拒否6等 |
| 旧compiled21本 | 全てexit 0。旧fieldのrootIntact2／rootAllowlists4、旧seedの再検査20、BS／BC境界・機械的順序の対照も維持 |
| composition＋新試験＋旧body5試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（src／tests） | exit 0、error 0／既存warning 374。今回のfixture／新試験はerror／warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル。src／tests・今回のfixture混入0。archive生成／公開なし |
| 文書・差分整合 | 更新4文書のローカルリンク41件・表23件と差分空白に異常なし |

関連30ファイルは前回の29ファイルに新probe-body-source-issuerを追加した。全repositoryのVitest回帰は今回未実施。新compiledの他、前回のstorage-data-split／body-bind-fields／body-bundle／body-live／body-seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの旧21本を実行した。実行環境のpackage取得・導入・設定変更は行っていない。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck`にcomposition fixtureと新source／旧storage-data-split／bind-fields／bundle／live／seed試験を明示した。buildは`bdo npm run build`、lintは既存src／tests全体のJSON集計。packは一時cacheの`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`で一覧確認し、cacheはfinallyで除去した。実ネットワーク・native reader／worker・OS接続は使わない。

## 未接続・Unknown

pin・source claim消費・payload借用／bind・構築ready・body起動・Journal供給・capture／回収・正式証拠・実予算更新は未接続。新入口をsource summaryから再開したり、既存held rootを第2prepareで継続したりしない。正常でもsourceは未pin／未使用、receiverは空のままである。

SS01〜12の本段階に該当する部分だけの検証で、全受入表・全guard・私有slotの任意破損に対する安全を保証しない。旧base節の単独対照範囲外／等価注記、実allocation／layout・E／S係数・実予算／全体work上界・OOMでの診断必着はUnknown。追加scalar／literal・有限検査を実費用の証明にしない。

正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。本記録作成時点ではindex登録・コミット・Pushなし。実接続・実通信・実機操作・設定変更は行っていない。

最終の作業中差分は合成fixture・新試験・compiled対照・開発export一覧・CHANGELOG・設計／検証文書の11ファイルだけ。src・manifest／lockfile・TypeScript／配布設定に差分なし。indexは空のまま。途中のREDと試験側の訂正を上記に保持し、最終確認時に未解消の検証失敗はない。次段階のpin／claim消費／bind・構築ready・body起動を有効化していない。

## レビュー修正（2026-11-11）

基準HEADは`c28b423`。修正前の全体検証は、lint・build・梱包分類・全vitest（336ファイル17,620件成功・失敗0）・compiled7本・差分空白検査のすべてが成功した。

一時mutant28種を流した。killされたのは16種だった。両方で生存した12種の内訳は次のとおり。

- BP01の`bodySourceDataMatches`の来歴4節：creationAttempted、fixedCount=9、metadataConfirmed=confirmed、buildStage。
- `bodySourceDataMatches`内の安定再検査の呼出し。既存のstable対照はBP00の発行前検査に掛かる位置へ注入していた。
- BP00 attemptの2回目の発行前検査と、その`!creationAttempted`節。
- metadata／進行fieldの`enumerable`節。単独で破るfaultがなかった。
- 等価・観測不能の3種：
  - `rejected`節。rejectedが付くのは失敗時だけで、構築はそこで止まる。
  - sourceの最初の失敗位置の上書き防止。新経路でも、2回目のfailは同じ位置か、close後は`#fixed`返却、held後は初回failになる。
  - shellのfailed化をstorage確認済みに限るgate。未確認shellはinspectで常に`unconfirmed`と投影されるため、外部から観測できない。

あわせて、source不在時の`first`／`phase`／`boundary`／`failurePhase`／`failureBoundary`／`refusal`／`deliveryFirst`が`unconfirmed`を返し、「不在→not_created」の規則と食い違っていた。

修正として次を行った。

- compiledへ単一注入の再検査対照7件（`recheckControls`）を追加した。BP00 attempt beforeとBP01 before beforeへ1つずつ故障を注入し、当該節が最初に`binding_mismatch`で拒否する位置（`failurePhase`／`failureStep`／`failureBoundary`）を固定する。節を外すと`source_held_unpinned`になるか、拒否位置が移ることを確認する。
- 非列挙field対照2件（`enumerableControls`）を追加した。metadataの`custodian`と進行fieldの`claim`を非列挙にすると、それぞれの`enumerable`節だけが拒否する。
- fixtureのsource投影7軸を、不在なら`not_created`、発行済み・metadata未確認なら`unconfirmed`に直した。

RED／GREEN：

- projectionはvitestへ不在／未確認の両方の期待値を先に加えた。不在側が失敗し（RED、1件失敗・199件成功）、fixture修正後は200件すべて成功した（GREEN）。
- 再検査とenumerableの9種は、修正前はvitest・compiledとも生存した（RED）。修正後は9種すべてが新対照の期待値assertでkillされた（GREEN）。
  - metadataConfirmed節の外部mutantは隣のfixedCount対照のanchorも消したため、anchor検査で止まった。anchor文字列を保った同義mutantで再確認し、`bp01-confirmed`対照の期待値assertで落ちることを確認した。

## コミット前の対象限定再検証（2026-11-11）

上記の未コミット・index未登録という記述は実装完了時点の記録である。今回の11ファイルだけをindexへ登録し、対象名が指定11件と一致することを確認した。そのindexの全追跡ファイルを新しい一時フォルダへ展開し、各対象がindexとbyte単位で一致することを確認した。未登録・未追跡の作業内容や既存distはコピーせず、ローカルnode_modulesだけを参照した。依存の取得・導入は行っていない。

同コピーでbuild・strict TypeScript・関連30ファイル2,373件・新旧compiled計22本が全てexit 0。新compiledの先行scalar18・全22field・readonly9／writable13・空carrier13・enum12・semantic拒否6も再確認した。全体lintはerror 0／既存warning 374、対象fixture／試験はerror／warning 0。offline・ignore-scriptsの梱包dry-runは441ファイルで、src／tests・今回のfixture混入0、archive生成／公開なし。更新4文書のローカルリンク41件・表23件と差分空白も確認した。全repositoryのVitest回帰は今回未実施であり、検証範囲を広げて主張しない。

再検証後の追記は本記録だけで、検証済みコード・試験・設定は変更していない。pin・claim消費・bind・構築ready・body起動・正式発行は未接続、全体受付無効・Unknown・調査保留を維持する。本節はコミット直前の確認記録であり、実接続・実通信・実機操作・設定変更・Pushは行っていない。
