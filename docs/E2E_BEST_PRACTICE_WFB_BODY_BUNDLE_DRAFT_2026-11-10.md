# WF-B BC12／13：同参照bundle／draft・shallow freeze・全post

Date: 2026-11-10 / 基準HEAD: `df6aa19` / 未コミット差分の合成検証。

対象は[live／bundle設計§12](BEST_PRACTICE_WFB_BODY_LIVE_SLOT_BUNDLE_DESIGN.md)と[構築設計§14](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)。開始時の作業ツリーはクリーン。正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更は行わず、本記録作成時点では未コミット・Pushなし。

## 実装と閉鎖境界

package除外のcomposition fixtureにcreateProbeBodyBundleFakeを追加した。同既存rootの保護区間でBC01〜11を生成し、BC11後のheld確定前からBC12／13へ進む。旧seed／live入口はそれぞれ5／11dataで止まり、旧正常返答・modelと空suffix条件を維持する。新入口は固定合成scriptだけを受け取り、任意callback・artifact／friend登録・再prepareによる追記を受け付けない。

BC12は同context／route pin／live6子を保持する専用brand付き9key、BC13は同bundle／run sealと固定kind／executable=falseを持つ別brand付き5keyである。唯一のroot custodyは維持し、descriptorを所有権移譲receipt・借用権限・正式証拠へ読み替えない。返却物をissuedへ即時保持した後に集約物だけをshallow freezeし、同currentを捕捉してstrict検査する。元live子の参照固定・進行fieldのwritable／Initial値は維持する。

各producer前に元base、全前段のconfirmed／予約／call到達・issued=current／rejectedなし・全data、対象とsuffixの空を検査する。共有prefix検査はBC12／13のimmutable検査へ明示振分けし、count=11以下の旧経路の空suffixを緩めない。BC12後にliveが変化すればBC13呼出し前に拒否し、BC13後には全13行と元baseを再検査する。

新model=wfb-body-bundle-draft-1は正常でもbundle_held／ok=falseで、root／shell ready=false、bind未試行・body borrowなし。公開返答は有限plain data・freeze・固定語彙／booleanのみで、bundle／draft／子参照・brand・raw例外を出さない。bind・構築ready・body／unwind・実予算更新・cleanup／discard・正式証拠は接続していない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-bundle | 62件成功 |
| 関連27ファイル | 2,146件成功、失敗0 |
| 新compiled-probe-body-bundle | exit 0。field12・子copy10、前段stage／identity各23、BC12後live6、最終post stage／identity各13、型拒否12、allowlist4等 |
| 旧compiled18本 | 全てexit 0 |
| composition＋body bundle／live／seed試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（既存src／tests） | exit 0、error 0／既存warning 374。今回のfixture・新試験とcomposition本体はerror／warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル、src／tests・今回のfixture混入0。archive生成／公開なし |
| 文書整合 | 更新設計／検証3文書のローカルリンク19件・表15件・BC12／13 schedule・末尾改行／空白に異常なし |

関連試験は前回のlive Initial検証で列挙した26ファイルと新probe-body-bundleを`bdo npx --no-install vitest run`へ明示した。全repositoryのvitest回帰は今回未実施。compiledは新bundleに加えbody-live／body-seed／local-exit等の前回18本も再実行した。最終の新compiledは追加の余分key2対照・allowlist4対照を含めて再実行し、全てexit 0。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-body-bundle.test.ts tests/review/probe-body-live.test.ts tests/review/probe-body-seed.test.ts`、buildは`bdo npm run build`。lintは既存のsrc／tests全体をJSON集計した。梱包は一時cache指定の`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`で一覧確認し、cacheはfinallyで除去した。製品／試験の期限・並列設定・配布設定は変更していない。

## 独立合成oracle

新probe-body-bundleは62件。正常1、全field12＋brand／extra／copy／getter／missing／prototype／unfrozen／non_enumerable各2の28、子の同値copy10、生成／freeze／全postの16位置、producer／freeze throw4、close／再入の有限loop各1、hostile入力／全入口閉鎖1である。固定field／境界一覧は本体のschema／scheduleをimportせず、独立に定義する。

各dataの6境界にfrozenを追加した14位置と、BC13 post_before／post_afterの2位置で、生成前・予約のみ・call到達／結果未確認・issuedのみ・current／provisional・confirmedのprefixを比較する。故障後の後続生成0、元返答cache、初回rejected、close後の保持、hook非実行、公開graphの700node未満・plain data／freeze／primitive終端を確認する。生成前closeは既存契約どおりfirst=none／disposition=closedである。

## compiled保証の範囲

全12fieldの関係節を各1つ外し、不正候補が拒否からbundle_heldへ変わることを確認する。子の同値copy10種も同じ節で拒否され、aggregate自体のcopy・brand・isFrozen・列挙性・余分keyの各2対照を持つ。getter付き候補はdata descriptor検査で拒否しhook0である。

BC12／13の全前段23位置についてstageとcurrent同一性を別々に破壊し、producer前に最初に拒否・call未到達であることを確認する。BC12後のlive6子の変化はBC13 beforeで、最後の全13位置のstage／identity変化はpost_beforeで拒否する。対応節を外した変異では成功化または最初の拒否位置の移動を要求し、後段失敗で元guardの欠落を覆い隠さない。

最終baseの実body状態変化、再帰freezeによるlive進行fieldの固定化も拒否する。issued保持の削除、初回rejectedとcurrentの同参照、先行state_invalidのcatch／close後保持、phase／boundary／failurePhase／failureBoundaryのallowlist、aggregate参照を診断へ漏らす変異を対照にする。変異とemit先は一時scratch限定、module URLは重複拒否し、finallyで除去する。

semantic compile-fail12行はdraft kind／executable、不正run seal／bundle／context／pin／progress、関数field追加、readonly参照の書換えを拒否する。同値copyはTypeScript構造型ではなくruntime参照検査で拒否する。

## 初回REDと範囲外

最初の正常試験はfactory未実装のTypeErrorで失敗し、固定生成継続を追加後に成功した。次の不正contextと子の同値copyは、固定故障scriptの未受付によるinput_rejectedでそれぞれ失敗し、malformed producerと受付済みの有限scriptを追加後にbinding_mismatch／保持の試験が成功した。期限・既存の期待値・製品設定は変更していない。

旧レビューで未対照だった元baseのcapture試行0・exit slot照合・matchesRunの単独感度は未対照のまま。全guardを検証済みとはせず、shared prefixの既存レビュー対照も維持する。16観測位置と2つの論理dataを実allocation／layout／E／S／全体work capへ昇格しない。実OOM時の診断必着・GC解放・実会計もUnknownである。

保持はcleanup確認・解放済みではなく未解決責務を同rootへ残す意味である。BD00以後・構築ready・BA／body・BU実操作・borrow退役／owner解放・実接続は未実装、正式発行口閉鎖・全体受付無効・調査保留を維持する。

最終確認時の変更は合成fixture／試験・compiled対照・export期待値・CHANGELOG・設計／検証文書の9ファイルだけ。src・manifest／lockfile・TypeScript／配布設定に差分なし。初期の3つのRED以外に未解消の試験失敗はなく、失敗保持／同参照／shallow freezeの確認をbody利用や全体受付の承認へ昇格しない。本記録作成時点ではindex登録・コミット・Pushは行っていない。

## レビュー修正（2026-11-10）

基準HEADは`29c53e1`。修正前の全体検証は、lint・build・梱包分類・全vitest（333ファイル17,393件成功・失敗0）・compiled5本（body-bundle／body-live／body-seed／declared-actual／canonical-gate-draft）・差分空白検査のすべてが成功した。

一時mutant9種を流した。意味上でkillされたのは7種だった。

- 返答cache
- 集約物のfrozen projection
- freeze→seal
- draftのrunSeal
- 最終postの無効化
- rejectedの差替え
- bundle data振分けのスキップ。外部mutantはanchor消失で止まったが、anchor文字列を保った同義mutantで期待値assertによるkillを確認した。

生存は2種だった。

- `bodyBundleMint`の元base照合：BC12／13のbeforeで単独に壊す対照がなかった。外すと拒否は最終postまで遅れ、producerが先に呼ばれる。
- `bodyBundleDataMatches`の`cell.rejected !== undefined`節：外部mutantではcompiledが止まったが、理由は既存copy対照のanchor消失だった。rejectedが付くのは不一致でfailした時だけで、構築はそこで止まる。「rejected付きで正規」という状態は作れないため、等価とした。live経路の同じ節も同じ理由で等価であり、live記録の「compiledだけでkill」を訂正した。

修正：compiledへBC12／13それぞれのmint前base対照2件（`mintBaseControls`）を追加した。各beforeへ元bodyの`running`化を単一注入し、当該beforeが最初に`binding_mismatch`で拒否すること、BC12／13のproducerが未呼出しであることを確認する。照合を外した変異では、拒否位置が移り、producerが呼ばれることを確認する。

RED／GREEN：修正前は照合を外した変異がvitest・compiledとも生存した（RED）。修正後は新対照の期待値assertでkillされる（GREEN）。修正後の全体検証も、lint・build・梱包分類・全vitest・compiled5本・差分空白検査のすべてが成功した。

## コミット前の対象限定再検証（2026-11-10）

対象9ファイルだけをindexへ登録し、そのindexの全追跡ファイルを新しい一時フォルダへ展開して再検証した。未登録・未追跡の作業中変更はコピーせず、対象9件の内容がindexとbyte単位で一致することを確認した。依存は既存のローカルnode_modulesを参照し、導入／取得は行っていない。

同コピーでbuild・strict TypeScript・関連27ファイル2,146件・compiled19本が全てexit 0。lintはerror 0／既存warning 374、offlineの梱包dry-runは441ファイル・今回のfixture混入0。設計／検証3文書のリンク19件・表15件と差分空白も確認した。全repositoryのvitest回帰は今回未実施であり、上記の対象範囲を広げて主張しない。

本節の追記は検証記録だけで、検証済みのコード／試験／設定は変更していない。コミット直前時点の記録として、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、bind・構築ready・body起動は未接続、実接続・実通信・設定変更・Pushなし。
